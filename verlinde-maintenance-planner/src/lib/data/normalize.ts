import type { AppData, DataIssue, Execution, PlanningSlot, WorkOrderObject } from "../../types/domain.ts";
import type { CsvTable, TableName } from "./repository.ts";
import { brusselsToday, brusselsMinute, DEFAULT_DURATION, normalizeInterval, overlaps, parseDate, parseTime, sourceOrderStatus } from "../domain/rules.ts";
import { loadTable } from "./repository.ts";

export type Tables = Record<TableName, CsvTable>;
export function normalizeData(tables: Tables, today = brusselsToday(), nowMinute = 0): AppData {
  const issues: DataIssue[] = Object.values(tables).flatMap(table => table.issues);
  const issue = (table: CsvTable, row: number, field: string, message: string, refs: { workOrderId?: string; sheetId?: string } = {}, severity: DataIssue["severity"] = "warning") => issues.push({ id: `issue-${issues.length}`, file: table.file, row, field, message, severity, ...refs });
  const get = (raw: Record<string, string>, key: string) => (raw[key] ?? "").trim();
  const unique = (table: CsvTable, key: string) => {
    const seen = new Set<string>();
    return table.rows.filter(({ raw, row }) => {
      const id = get(raw, key);
      if (!id || seen.has(id)) { issue(table, row, key, !id ? "Identificatie ontbreekt; rij overgeslagen." : `Dubbele identificatie ${id}; eerste rij behouden.`); return false; }
      seen.add(id); return true;
    });
  };
  const customers = unique(tables.REL, "code").map(({ raw }) => ({ id: get(raw, "code"), name: get(raw, "naam") || `Onbekende klant (${get(raw, "code")})` }));
  const resources = unique(tables.RES, "code").map(({ raw }) => ({ id: get(raw, "code"), name: get(raw, "naam") || `Onbekende resource (${get(raw, "code")})`, role: get(raw, "rol") }));
  const customerIds = new Set(customers.map(item => item.id));
  const resourceIds = new Set(resources.map(item => item.id));
  const categoryLabels: Record<string, string> = { INBR: "Inbraak", BRAND: "Branddetectie", CAM: "Camera", TOEG: "Toegangscontrole" };
  const sheets = unique(tables.MS_HDR, "nr").filter(({ raw }) => get(raw, "actief").toUpperCase() !== "N").map(({ raw, row }) => {
    const id = get(raw, "nr"), refs = { sheetId: id };
    if (!customerIds.has(get(raw, "klant"))) issue(tables.MS_HDR, row, "klant", `Klant ${get(raw, "klant") || "zonder code"} ontbreekt in relaties.`, refs);
    for (const field of ["laatste", "volgende"]) {
      if (!parseDate(get(raw, field))) issue(tables.MS_HDR, row, field, `${field === "laatste" ? "Laatste" : "Volgende"} onderhoudsdatum ontbreekt of is ongeldig.`, refs);
    }
    const interval = normalizeInterval(get(raw, "frequentie"));
    if (interval.months === null) issue(tables.MS_HDR, row, "frequentie", "Onderhoudsinterval ontbreekt of is niet eenduidig.", refs);
    return { id, customerId: get(raw, "klant"), description: get(raw, "omschrijving") || `Installatie ${id}`, category: categoryLabels[get(raw, "type")] ?? (get(raw, "type") || "Onbekend"), site: get(raw, "pand") || "Locatie ontbreekt", lastDate: parseDate(get(raw, "laatste")), nextDate: parseDate(get(raw, "volgende")), intervalLabel: interval.label, intervalMonths: interval.months };
  });
  const sheetMap = new Map(sheets.map(item => [item.id, item]));
  const orderRows = unique(tables.WO_HDR, "nr");
  const orderIds = new Set(orderRows.map(({ raw }) => get(raw, "nr")));
  const workOrderObjects: WorkOrderObject[] = [];
  const links = new Map<string, Set<string>>();
  const objectDescriptions = new Map<string, string>();
  const objectKinds = new Map<string, string>();
  // WO_OBJ is the only imported fiche/work-order relation. WO_HDR.fiche is ignored.
  tables.WO_OBJ.rows.forEach(({ raw, row }) => {
    const id = get(raw, "werkbon"), sheetId = get(raw, "fiche");
    if (!orderIds.has(id)) { issue(tables.WO_OBJ, row, "werkbon", `Werkorder ${id || "zonder nummer"} ontbreekt.`, { workOrderId: id }); return; }
    if (!sheetMap.has(sheetId)) { issue(tables.WO_OBJ, row, "fiche", `Installatie ${sheetId || "zonder nummer"} ontbreekt.`, { workOrderId: id }); return; }
    const kind = get(raw, "soort");
    workOrderObjects.push({ workOrderId: id, sheetId, kind, source: "csv" });
    if (!kind) issue(tables.WO_OBJ, row, "soort", "Interventietype ontbreekt; onderhoud kan niet worden bepaald.", { workOrderId: id, sheetId });
    const values = links.get(id) ?? new Set<string>();
    values.add(sheetId); links.set(id, values);
    objectDescriptions.set(id, get(raw, "omschrijving"));
    objectKinds.set(id, get(raw, "soort"));
  });
  const workOrders = orderRows.map(({ raw, row }) => {
    const id = get(raw, "nr"), customerId = get(raw, "klant");
    const sheetIds = [...(links.get(id) ?? [])];
    if (!customerIds.has(customerId)) issue(tables.WO_HDR, row, "klant", `Klant ${customerId || "zonder code"} ontbreekt.`, { workOrderId: id });
    sheetIds.forEach(sheetId => {
      const sheet = sheetMap.get(sheetId);
      if (sheet && sheet.customerId !== customerId) issue(tables.WO_HDR, row, "klant", `Klant van werkorder verschilt van gekoppelde installatie ${sheetId}; beide bronwaarden behouden.`, { workOrderId: id, sheetId });
    });
    const rawStatus = get(raw, "status");
    if (!["Completed", "Invoiced", "Planned", "Implemented", "Verified"].includes(rawStatus)) issue(tables.WO_HDR, row, "status", `Onbekende status '${rawStatus}'; werkorder blijft actief.`, { workOrderId: id });
    return { id, customerId, installation: sheetIds.map(sheetId => sheetMap.get(sheetId)?.description).filter(Boolean).join(" · ") || objectDescriptions.get(id) || "Installatie ontbreekt", description: get(raw, "omschrijving") || "Omschrijving ontbreekt", site: get(raw, "werfadres") || "Locatie ontbreekt", kind: get(raw, "soort") || objectKinds.get(id) || "Onbekend", date: parseDate(get(raw, "datum")), createdDate: parseDate(get(raw, "aangemaakt")), sourceStatus: rawStatus, status: sourceOrderStatus(rawStatus), hasInvalidPlanning: false };
  });
  const invalidPlanning: AppData["invalidPlanning"] = [];
  const invalidOrderIds = new Set<string>();
  function hours(table: CsvTable, planned: boolean): PlanningSlot[] {
    const result: PlanningSlot[] = [];
    table.rows.forEach(({ raw, row }) => {
      const id = get(raw, "werkbon"), resourceId = get(raw, "tech"), date = parseDate(get(raw, "datum")), start = parseTime(get(raw, "van")), end = parseTime(get(raw, "tot"));
      const reasons: [string, string][] = [];
      if (!orderIds.has(id)) reasons.push(["werkbon", `Werkorder ${id || "zonder nummer"} ontbreekt.`]);
      if (!resourceIds.has(resourceId)) reasons.push(["tech", `Resource ${resourceId || "zonder code"} ontbreekt.`]);
      if (!date) reasons.push(["datum", "Datum ontbreekt of is ongeldig."]);
      if (start === null || end === null || (end === start && !planned)) reasons.push(["van/tot", "Ongeldig tijdsbereik; bronwaarden zijn ongewijzigd behouden."]);
      reasons.forEach(([field, message]) => issue(table, row, field, message, { workOrderId: id }));
      if (reasons.length) {
        if (planned) { invalidOrderIds.add(id); invalidPlanning.push({ file: table.file, row, workOrderId: id, raw: { ...raw } }); }
        return;
      }
      if (start! > end!) {
        issue(table, row, "van/tot", `Tijdvolgorde genormaliseerd: ${get(raw, "van")}-${get(raw, "tot")} naar ${get(raw, "tot")}-${get(raw, "van")}.`, { workOrderId: id }, "info");
      }
      const normalizedStart = Math.min(start!, end!);
      const normalizedEnd = planned && start === end ? normalizedStart + DEFAULT_DURATION : Math.max(start!, end!);
      if (planned && start === end) {
        issue(table, row, "van/tot", `Nulduur genormaliseerd: ${get(raw, "van")}-${get(raw, "tot")} naar een afspraak van 2 uur.`, { workOrderId: id }, "info");
      }
      if (planned && (normalizedStart < 480 || normalizedEnd > 1080)) {
        issue(table, row, "van/tot", "Afspraak valt buiten 08:00-18:00.", { workOrderId: id });
      }
      result.push({ id: `${planned ? "pl" : "ex"}-${row}`, workOrderId: id, resourceId, date: date!, start: normalizedStart, end: normalizedEnd });
    });
    return result;
  }
  const importedSlots = hours(tables.WO_HRS_PL, true);
  const executions: Execution[] = hours(tables.WO_HRS_EX, false).map(slot => ({ ...slot, source: "csv" }));
  // Reject unusable rows, preserving every usable booking for the same order.
  const slots = importedSlots;
  workOrders.forEach(order => { order.hasInvalidPlanning = invalidOrderIds.has(order.id); if (order.status !== "completed") order.status = slots.some(slot => slot.workOrderId === order.id) ? "planned" : "unplanned"; });
  slots.forEach((slot, index) => {
    const order = workOrders.find(item => item.id === slot.workOrderId);
    if (order?.status !== "completed" && slots.slice(0, index).some(other => workOrders.find(item => item.id === other.workOrderId)?.status !== "completed" && overlaps(slot, other))) issue(tables.WO_HRS_PL, Number(slot.id.slice(3)), "van/tot", "Geïmporteerde boeking overlapt een andere actieve boeking; beide blijven zichtbaar.", { workOrderId: slot.workOrderId });
  });
  tables.WO_ART_PL.rows.forEach(({ raw, row }) => {
    const id = get(raw, "werkbon");
    if (!orderIds.has(id)) issue(tables.WO_ART_PL, row, "werkbon", `Artikel verwijst naar ontbrekende werkorder ${id}.`, { workOrderId: id });
    for (const field of ["aantal", "prijs"]) {
      const value = get(raw, field).replace(",", ".");
      if (!value || !Number.isFinite(Number(value))) issue(tables.WO_ART_PL, row, field, "Artikelwaarde ontbreekt of is ongeldig.", { workOrderId: id });
    }
  });
  return { today, nowMinute, rawPlanning: tables.WO_HRS_PL.rows.map(({ row, raw }) => ({ file: tables.WO_HRS_PL.file, row, workOrderId: get(raw, "werkbon"), raw: { ...raw } })), customers, sheets, resources, workOrders, workOrderObjects, slots, executions, issues, invalidPlanning };
}
export async function loadAppData(directory?: string, today?: string): Promise<AppData> {
  const names: TableName[] = ["REL", "MS_HDR", "WO_HDR", "WO_OBJ", "WO_HRS_PL", "WO_HRS_EX", "RES", "WO_ART_PL"];
  const values = await Promise.all(names.map(name => loadTable(name, directory)));
  return normalizeData(Object.fromEntries(names.map((name, index) => [name, values[index]])) as Tables, today ?? brusselsToday(), today ? 0 : brusselsMinute());
}
