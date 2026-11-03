import type { AppData, Appointment, MaintenanceSheet, MaintenanceStatus, ResolvedExecution, WorkOrder } from "../../types/domain.ts";
import { maintenanceStatus, validIsoDate } from "./rules.ts";
import { createRelationSelectors, type RelationSelectors } from "./relations.ts";

export type MaintenanceActionState = "to-start" | "to-plan" | "planned" | "check-closure";
export type MaintenanceAction = "Werkorder maken" | "Plannen" | "Afspraak bekijken" | "Afsluiting controleren";
export type MaintenanceFilter = "all" | MaintenanceStatus | MaintenanceActionState;
export type MaintenanceSortKey = "customer" | "category" | "nextDate" | "urgency" | "status" | "workOrder" | "appointment" | "action";
export type MaintenanceSort = { key: MaintenanceSortKey; direction: "asc" | "desc" } | null;
export interface MaintenanceReason { code: string; message: string; workOrderIds?: string[] }
export interface MaintenanceOverviewRow {
  sheet: MaintenanceSheet; customer: string; urgency: MaintenanceStatus; state: MaintenanceActionState;
  selectedWorkOrder: WorkOrder | null; appointment: Appointment | null; execution: ResolvedExecution | null;
  action: MaintenanceAction; reasons: MaintenanceReason[];
}
export interface MaintenanceHistoryEntry {
  order: WorkOrder; kind: string; date: string | null; statusLabel: string;
  appointments: Appointment[]; executions: ResolvedExecution[];
}
export const maintenanceUrgencyLabels: Record<MaintenanceStatus, string> = { overdue: "Achterstallig", upcoming: "Binnenkort", ok: "Op schema", missing: "Onbekend" };
export const maintenanceActionLabels: Record<MaintenanceActionState, string> = {
  "to-start": "Te starten", "to-plan": "Te plannen", planned: "Gepland", "check-closure": "Afsluiting controleren",
};
const actions: Record<MaintenanceActionState, MaintenanceAction> = { "to-start": "Werkorder maken", "to-plan": "Plannen", planned: "Afspraak bekijken", "check-closure": "Afsluiting controleren" };
const collator = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });
const actionPriority: Record<MaintenanceActionState, number> = { "to-start": 0, "to-plan": 1, "check-closure": 2, planned: 3 };
const urgencyPriority: Record<MaintenanceStatus, number> = { overdue: 0, upcoming: 1, ok: 2, missing: 3 };
const validDate = (date?: string | null) => date && validIsoDate(date) ? date : null;

// History selection never determines the current work-order action.
export function relevantAppointment(data: AppData, sheetId: string): Appointment | null {
  return createRelationSelectors(data).getRelevantAppointmentForMaintenanceSheet(sheetId);
}
export function createMaintenanceSelectors(data: AppData, relations = createRelationSelectors(data)) {
  const customers = new Map(data.customers.map(customer => [customer.id, customer.name]));
  const cached = new Map<string, MaintenanceOverviewRow>();
  const historyCache = new Map<string, MaintenanceHistoryEntry[]>();
  function getMaintenanceAction(sheetId: string): MaintenanceOverviewRow | null {
    const existing = cached.get(sheetId); if (existing) return existing;
    const sheet = relations.managementSheetsById.get(sheetId); if (!sheet) return null;
    const urgency = maintenanceStatus(sheet, data.today);
    const active = relations.getOpenMaintenanceWorkOrders(sheetId);
    const selectedWorkOrder = active[0] ?? null;
    const appointment = selectedWorkOrder ? relations.getFutureAppointmentsForWorkOrder(selectedWorkOrder.id)[0] ?? null : null;
    const executions = selectedWorkOrder ? relations.getExecutedHoursForWorkOrder(selectedWorkOrder.id) : [];
    const execution = [...executions].sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start)[0] ?? null;
    const state: MaintenanceActionState = execution ? "check-closure" : appointment ? "planned" : selectedWorkOrder ? "to-plan" : "to-start";
    // Warnings are contextual information only; they never replace urgency or follow-up.
    const reasons: MaintenanceReason[] = [];
    if (urgency === "missing") reasons.push({ code: "missing-next-date", message: "De volgende onderhoudsdatum ontbreekt of is ongeldig." });
    if (validDate(sheet.lastDate) && validDate(sheet.nextDate) && sheet.nextDate! <= sheet.lastDate!) reasons.push({ code: "inconsistent-maintenance-dates", message: "De volgende onderhoudsdatum ligt niet na het laatste geregistreerde onderhoud. Beide bronwaarden zijn behouden." });
    if (active.length > 1) reasons.push({ code: "multiple-active-orders", message: "Er zijn meerdere actieve onderhoudswerkorders. De nieuwste op aanmaakdatum wordt getoond.", workOrderIds: active.map(order => order.id) });
    const objects = relations.workOrderObjectsBySheetId.get(sheetId) ?? [];
    const kinds = new Map<string, Set<string>>();
    for (const object of objects) { const values = kinds.get(object.workOrderId) ?? new Set<string>(); values.add(object.kind.trim().toLowerCase()); kinds.set(object.workOrderId, values); }
    if ([...kinds.values()].some(values => values.size > 1 || [...values].some(kind => !["onderhoud", "herstelling", "garantie", "installatie"].includes(kind)))) reasons.push({ code: "ambiguous-intervention", message: "Een interventietype in WO_OBJ ontbreekt of is tegenstrijdig. Er wordt geen type uit de werkorderheader overgenomen." });
    if (selectedWorkOrder) {
      if (!validDate(selectedWorkOrder.createdDate)) reasons.push({ code: "missing-creation-date", message: "De aanmaakdatum van de werkorder ontbreekt of is ongeldig; het werkordernummer bepaalt de vaste volgorde." });
      if (selectedWorkOrder.customerId !== sheet.customerId) reasons.push({ code: "customer-mismatch", message: "De klant op de werkorder verschilt van de klant op de onderhoudsfiche." });
      if (state === "to-plan" && relations.getPastAppointmentsForWorkOrder(selectedWorkOrder.id).length) reasons.push({ code: "past-without-execution", message: "Er zijn eerdere afspraken zonder geregistreerde uitvoering. Er is geen toekomstige afspraak." });
      if (execution && execution.source !== "session" && execution.date > data.today) reasons.push({ code: "future-execution", message: "Een geregistreerde uitvoeringsdatum ligt in de toekomst. Controleer de uren." });
    }
    const row = { sheet, customer: customers.get(sheet.customerId) ?? "Onbekende klant", urgency, state, selectedWorkOrder, appointment, execution, action: actions[state], reasons };
    cached.set(sheetId, row); return row;
  }
  function getHistory(sheetId: string): MaintenanceHistoryEntry[] {
    const existing = historyCache.get(sheetId); if (existing) return existing;
    const kinds = new Map<string, Set<string>>();
    for (const object of relations.workOrderObjectsBySheetId.get(sheetId) ?? []) { const values = kinds.get(object.workOrderId) ?? new Set<string>(); if (object.kind) values.add(object.kind); kinds.set(object.workOrderId, values); }
    const entries = relations.getWorkOrdersForMaintenanceSheet(sheetId).map(order => ({
      order, kind: [...(kinds.get(order.id) ?? [])].join(" / ") || "Type onbekend",
      date: validDate(order.date) ?? validDate(order.createdDate),
      statusLabel: order.status === "completed" && !["completed", "invoiced"].includes(order.sourceStatus.trim().toLowerCase()) ? `Voltooid · bronstatus ${order.sourceStatus}` : order.sourceStatus,
      appointments: relations.getAppointmentsForWorkOrder(order.id),
      executions: relations.getExecutedHoursForWorkOrder(order.id).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start),
    })).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || collator.compare(b.order.id, a.order.id));
    historyCache.set(sheetId, entries); return entries;
  }
  return { getMaintenanceAction, getHistory, getOverview: () => data.sheets.flatMap(sheet => { const row = getMaintenanceAction(sheet.id); return row ? [row] : []; }) };
}
export type MaintenanceSelectors = ReturnType<typeof createMaintenanceSelectors>;
export function getMaintenanceAction(data: AppData, sheetId: string): MaintenanceOverviewRow | null { return createMaintenanceSelectors(data).getMaintenanceAction(sheetId); }
export function getMaintenanceOverview(data: AppData, relations?: RelationSelectors): MaintenanceOverviewRow[] { return createMaintenanceSelectors(data, relations).getOverview(); }
export function matchesMaintenanceFilter(row: MaintenanceOverviewRow, filter: MaintenanceFilter): boolean {
  return filter === "all" || (["overdue", "upcoming", "ok", "missing"].includes(filter) ? row.urgency === filter : row.state === filter);
}
export function maintenanceSummary(rows: MaintenanceOverviewRow[]) {
  const count = (filter: MaintenanceFilter) => rows.filter(row => matchesMaintenanceFilter(row, filter)).length;
  return { overdue: count("overdue"), upcoming: count("upcoming"), toPlan: count("to-plan"), planned: count("planned") };
}
export function nextMaintenanceSort(current: MaintenanceSort, key: MaintenanceSortKey): MaintenanceSort {
  if (current?.key !== key) return { key, direction: "asc" };
  return current.direction === "asc" ? { key, direction: "desc" } : null;
}
const defaultPriority: Record<MaintenanceStatus, Record<MaintenanceActionState, number>> = {
  overdue: { "to-start": 0, "to-plan": 1, "check-closure": 2, planned: 3 },
  upcoming: { "to-start": 4, "to-plan": 5, "check-closure": 8, planned: 10 },
  missing: { "to-start": 6, "to-plan": 7, "check-closure": 9, planned: 11 },
  ok: { "to-start": 15, "to-plan": 13, "check-closure": 12, planned: 14 },
};
function compareNextDate(a: MaintenanceOverviewRow, b: MaintenanceOverviewRow): number {
  const first = validDate(a.sheet.nextDate), second = validDate(b.sheet.nextDate);
  if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
  return first.localeCompare(second);
}
export function sortMaintenanceRows(rows: MaintenanceOverviewRow[], sort: MaintenanceSort): MaintenanceOverviewRow[] {
  function defaultCompare(a: MaintenanceOverviewRow, b: MaintenanceOverviewRow) {
    return defaultPriority[a.urgency][a.state] - defaultPriority[b.urgency][b.state] || compareNextDate(a, b)
      || collator.compare(a.customer, b.customer)
      || collator.compare(a.sheet.description, b.sheet.description) || collator.compare(a.sheet.id, b.sheet.id);
  }
  function value(row: MaintenanceOverviewRow): string | number | null {
    switch (sort?.key) {
      case "customer": return row.customer;
      case "category": return row.sheet.category || null;
      case "nextDate": return validDate(row.sheet.nextDate);
      case "urgency": return urgencyPriority[row.urgency];
      case "status": return actionPriority[row.state];
      case "workOrder": return row.selectedWorkOrder?.id ?? null;
      case "appointment": return row.appointment ? `${row.appointment.date}T${String(row.appointment.start).padStart(4, "0")}` : null;
      case "action": return row.action;
      default: return null;
    }
  }
  return [...rows].sort((a, b) => {
    if (!sort) return defaultCompare(a, b);
    const first = value(a), second = value(b);
    if (first === null || second === null) return first === second ? defaultCompare(a, b) : first === null ? 1 : -1;
    const comparison = typeof first === "number" && typeof second === "number" ? first - second : collator.compare(String(first), String(second));
    const secondary = sort.key === "customer" ? collator.compare(a.sheet.description, b.sheet.description) : 0;
    return (comparison || secondary) * (sort.direction === "asc" ? 1 : -1) || defaultCompare(a, b);
  });
}
export function sortMaintenance(data: AppData, sheets: MaintenanceSheet[], sort: MaintenanceSort): MaintenanceSheet[] {
  const ids = new Set(sheets.map(sheet => sheet.id));
  return sortMaintenanceRows(getMaintenanceOverview(data).filter(row => ids.has(row.sheet.id)), sort).map(row => row.sheet);
}
