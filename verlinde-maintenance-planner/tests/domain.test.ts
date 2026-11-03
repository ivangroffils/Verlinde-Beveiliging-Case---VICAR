import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseTime, normalizeInterval, maintenanceStatus, sourceOrderStatus, openMaintenanceOrders, validatePlanning, brusselsToday } from "../src/lib/domain/rules.ts";
import { initialState, reducer } from "../src/lib/domain/state.ts";
import { parseCsv, loadTable } from "../src/lib/data/repository.ts";
import { loadAppData, normalizeData, type Tables } from "../src/lib/data/normalize.ts";
import type { AppData, MaintenanceSheet, PlanningSlot } from "../src/types/domain.ts";

const real = await loadAppData(undefined, "2026-11-03");
const sheet: MaintenanceSheet = { id: "s", customerId: "c", description: "Alarm", category: "Inbraak", site: "Teststraat", lastDate: null, nextDate: null, intervalLabel: "Jaarlijks", intervalMonths: 12 };
function fixture(): AppData {
  return { today: "2026-11-03", customers: [{ id: "c", name: "Klant" }], sheets: [sheet], resources: [{ id: "r", name: "Volledige Naam", role: "PT" }], workOrders: [{ id: "w", customerId: "c", sheetIds: ["s"], description: "Onderhoud", installation: "Alarm", site: "Teststraat", kind: "Onderhoud", sourceStatus: "Planned", status: "unplanned", hasInvalidPlanning: false }], slots: [], executions: [], issues: [], invalidPlanning: [] };
}
const candidate: PlanningSlot = { id: "new", workOrderId: "w", resourceId: "r", date: "2026-11-03", start: 600, end: 720 };
function tablesWithPlanning(row: Record<string, string>): Tables {
  const empty = (name: string) => ({ file: `${name}.csv`, rows: [], issues: [] });
  return {
    REL: { ...empty("REL"), rows: [{ row: 2, raw: { code: "c", naam: "Klant" } }] },
    RES: { ...empty("RES"), rows: [{ row: 2, raw: { code: "r", naam: "Resource", rol: "PT" } }] },
    MS_HDR: { ...empty("MS_HDR"), rows: [{ row: 2, raw: { nr: "s", klant: "different", omschrijving: "Alarm", actief: "J", volgende: "", laatste: "", frequentie: "1J" } }] },
    WO_HDR: { ...empty("WO_HDR"), rows: [{ row: 2, raw: { nr: "w", klant: "c", fiche: "s", soort: "Onderhoud", status: "Planned" } }] },
    WO_OBJ: empty("WO_OBJ"), WO_HRS_PL: { ...empty("WO_HRS_PL"), rows: [{ row: 2, raw: row }] }, WO_HRS_EX: empty("WO_HRS_EX"), WO_ART_PL: empty("WO_ART_PL"),
  };
}
test("strict dates reject empty, impossible, partial and ambiguous formats", () => {
  for (const value of ["", "31/02/2026", "29/02/2025", "1/11/2026", "2026-11-03", "03/11/26", "03/11/2026junk"]) assert.equal(parseDate(value), null, value);
  assert.equal(parseDate("29/02/2024"), "2024-02-29");
});
test("strict times never swap or repair invalid values", () => {
  for (const value of ["", "8:00", "24:00", "10:60", "-1:00"]) assert.equal(parseTime(value), null);
  assert.equal(parseTime("08:30"), 510);
});
test("known frequencies normalize; ambiguous intervals remain unknown", () => {
  for (const value of ["1J", "jaarlijks", "12M", "1 x per jaar"]) assert.equal(normalizeInterval(value).months, 12);
  assert.equal(normalizeInterval("2J").months, 24);
  assert.equal(normalizeInterval("6M").months, 6);
  for (const value of ["12", "?", "op vraag", ""]) assert.equal(normalizeInterval(value).months, null);
});
test("maintenance urgency uses explicit next dates and inclusive 30-day boundaries", () => {
  assert.equal(maintenanceStatus(sheet, "2026-11-03"), "missing");
  assert.equal(maintenanceStatus({ ...sheet, lastDate: "2025-01-01" }, "2026-11-03"), "missing");
  for (const [date, status] of [["2026-11-02", "overdue"], ["2026-11-03", "upcoming"], ["2026-12-03", "upcoming"], ["2026-12-04", "ok"], ["2026-02-31", "missing"]]) assert.equal(maintenanceStatus({ ...sheet, nextDate: date }, "2026-11-03"), status);
});
test("today uses Brussels calendar boundaries rather than UTC", () => {
  assert.equal(brusselsToday(new Date("2026-11-02T23:30:00Z")), "2026-11-03");
});
test("only Completed and Invoiced are final legacy stages", () => {
  for (const value of ["Completed", "Invoiced"]) assert.equal(sourceOrderStatus(value), "completed");
  for (const value of ["Planned", "Implemented", "Verified", "Unknown", ""]) assert.equal(sourceOrderStatus(value), "unplanned");
});
test("CSV parser handles BOM, quoted semicolons, blank lines and malformed schema", () => {
  const parsed = parseCsv('\uFEFFcode;naam\r\na;"Klant; naam"\r\n\r\n', "test.csv", ["code", "naam"]);
  assert.equal(parsed.rows.length, 1); assert.equal(parsed.rows[0].raw.naam, "Klant; naam");
  assert.ok(parseCsv("wrong;headers\na;b", "test.csv", ["code"]).issues.length);
  assert.equal(parseCsv("wrong;headers\na;b", "test.csv", ["code"]).rows.length, 0);
  assert.ok(parseCsv('code;naam\na;"unclosed', "test.csv", ["code"]).issues.length);
});
test("missing CSV files produce inspectable issues without throwing", async () => {
  const table = await loadTable("REL", "does-not-exist");
  assert.equal(table.rows.length, 0); assert.equal(table.issues[0].field, "bestand");
});
test("real CSV normalization preserves expected source counts and issues", () => {
  assert.equal(real.customers.length, 138); assert.equal(real.sheets.length, 193); assert.equal(real.workOrders.length, 561); assert.equal(real.resources.length, 5);
  assert.equal(real.invalidPlanning.length, 89);
  assert.equal(real.issues.filter(issue => issue.message.startsWith("Klant van werkorder verschilt")).length, 37);
  assert.equal(real.sheets.filter(item => !item.nextDate).length, 185);
  assert.ok(real.issues.some(issue => issue.message.includes("overlapt")));
  assert.equal(real.resources.find(resource => resource.id === "BRT")?.name, "Brandtec (onderaannemer)");
});
test("every invalid imported planning row remains unchanged and its active order is unplanned", () => {
  for (const row of real.invalidPlanning) {
    assert.ok(row.raw.van); assert.ok(row.raw.tot);
    assert.equal(real.slots.some(slot => slot.workOrderId === row.workOrderId), false);
    const order = real.workOrders.find(item => item.id === row.workOrderId)!;
    if (order.status !== "completed") assert.equal(order.status, "unplanned");
    assert.equal(order.hasInvalidPlanning, true);
    assert.ok(real.issues.some(issue => issue.file === row.file && issue.row === row.row));
  }
});
test("unknown resources, orphan orders and bad dates invalidate planning without correction", () => {
  for (const changes of [{ tech: "unknown" }, { werkbon: "orphan" }, { datum: "31/02/2026" }, { van: "13:00", tot: "10:00" }, { van: "10:00", tot: "10:00" }]) {
    const raw = { werkbon: "w", datum: "03/11/2026", tech: "r", van: "08:00", tot: "10:00", taak: "", ...changes };
    const result = normalizeData(tablesWithPlanning(raw), "2026-11-03");
    assert.equal(result.slots.length, 0); assert.deepEqual(result.invalidPlanning[0].raw, raw); assert.ok(result.issues.length);
  }
});
test("a valid second planning row does not hide an invalid row for the same active order", () => {
  const tables = tablesWithPlanning({ werkbon: "w", datum: "03/11/2026", tech: "r", van: "13:00", tot: "10:00" });
  tables.WO_HRS_PL.rows.push({ row: 3, raw: { werkbon: "w", datum: "03/11/2026", tech: "r", van: "08:00", tot: "10:00" } });
  const data = normalizeData(tables, "2026-11-03");
  assert.equal(data.workOrders[0].status, "unplanned"); assert.equal(data.slots.length, 0);
});
test("customer mismatches remain explicit rather than overwriting either customer", () => {
  const data = normalizeData(tablesWithPlanning({ werkbon: "w", datum: "03/11/2026", tech: "r", van: "08:00", tot: "10:00" }), "2026-11-03");
  assert.equal(data.workOrders[0].customerId, "c"); assert.equal(data.sheets[0].customerId, "different");
  assert.ok(data.issues.some(issue => issue.field === "klant")); assert.equal(openMaintenanceOrders(data, "s").length, 1);
});
test("create copies sheet context, links immediately, uses temporary ids and prevents duplicate creation", () => {
  const data = fixture(); data.workOrders = [];
  const created = reducer(initialState(data), { type: "create", sheetId: "s" });
  assert.equal(created.workOrders[0].id, "TEMP-001"); assert.equal(created.workOrders[0].status, "unplanned"); assert.deepEqual(created.workOrders[0].sheetIds, ["s"]);
  assert.equal(created.workOrders[0].customerId, "c"); assert.equal(created.workOrders[0].site, sheet.site); assert.equal(created.workOrders[0].installation, sheet.description);
  const duplicate = reducer(created, { type: "create", sheetId: "s" }); assert.equal(duplicate.workOrders.length, 1); assert.ok(duplicate.error);
  assert.equal(data.workOrders.length, 0);
});
test("maintenance linkage excludes closed orders and repair work", () => {
  const data = fixture();
  assert.equal(openMaintenanceOrders(data, "s").length, 1);
  data.workOrders[0].kind = "Herstelling"; assert.equal(openMaintenanceOrders(data, "s").length, 0);
  data.workOrders[0].kind = "Onderhoud"; data.workOrders[0].status = "completed"; assert.equal(openMaintenanceOrders(data, "s").length, 0);
});
test("planning allows adjacency, rejects overlap and excludes the moved slot", () => {
  const data = fixture(); data.slots = [{ ...candidate, id: "old", start: 480, end: 600 }];
  assert.equal(validatePlanning(data, candidate), null);
  assert.match(validatePlanning(data, { ...candidate, start: 570 })!, /overlapt/);
  assert.equal(validatePlanning(data, { ...data.slots[0], end: 630 }), null);
});
test("invalid dates, resources, grid intervals and window boundaries are rejected", () => {
  const data = fixture();
  for (const changes of [{ date: "2026-02-31" }, { resourceId: "missing" }, { start: 479 }, { start: 480, end: 1110 }, { start: 600, end: 600 }, { start: 610 }, { end: 721 }, { start: NaN }]) assert.ok(validatePlanning(data, { ...candidate, ...changes }));
  assert.equal(validatePlanning(data, { ...candidate, start: 480, end: 1080 }), null);
});
test("failed moves leave schedules unchanged and successful moves preserve duration", () => {
  const data = fixture(); data.slots = [{ ...candidate, id: "old", start: 480, end: 690 }]; data.workOrders[0].status = "planned";
  const state = initialState(data);
  const failed = reducer(state, { type: "schedule", workOrderId: "w", slotId: "old", resourceId: "r", date: "2026-11-04", start: 1020 });
  assert.deepEqual(failed.slots, state.slots); assert.ok(failed.error);
  const moved = reducer(state, { type: "schedule", workOrderId: "w", slotId: "old", resourceId: "r", date: "2026-11-04", start: 600 });
  assert.equal(moved.slots[0].end, 810); assert.equal(moved.slots[0].date, "2026-11-04"); assert.equal(moved.slots.length, 1);
});
test("manual scheduling of an invalid import preserves all original rows and issues", () => {
  const data = normalizeData(tablesWithPlanning({ werkbon: "w", datum: "03/11/2026", tech: "r", van: "13:00", tot: "10:00" }), "2026-11-03");
  const snapshot = structuredClone(data.invalidPlanning);
  const scheduled = reducer(initialState(data), { type: "schedule", workOrderId: "w", resourceId: "r", date: "2026-11-04", start: 480 });
  assert.equal(scheduled.workOrders[0].status, "planned"); assert.equal(scheduled.slots[0].end, 600); assert.deepEqual(scheduled.invalidPlanning, snapshot); assert.deepEqual(scheduled.issues, data.issues);
  assert.equal(scheduled.workOrders[0].hasInvalidPlanning, true);
});
test("completion needs a plan, records exact execution once and does not change maintenance dates", () => {
  const state = initialState(fixture());
  assert.ok(reducer(state, { type: "complete", workOrderId: "w" }).error);
  const planned = reducer(state, { type: "schedule", workOrderId: "w", resourceId: "r", date: "2026-11-03", start: 480 });
  const completed = reducer(planned, { type: "complete", workOrderId: "w" });
  assert.equal(completed.workOrders[0].status, "completed"); assert.equal(completed.slots.length, 0); assert.equal(completed.executions.length, 1);
  assert.equal(completed.executions[0].start, 480); assert.equal(completed.executions[0].end, 600); assert.equal(completed.executions[0].resourceId, "r"); assert.equal(completed.executions[0].date, "2026-11-03");
  assert.deepEqual(completed.sheets, state.sheets);
  const repeated = reducer(completed, { type: "complete", workOrderId: "w" }); assert.equal(repeated.executions.length, 1); assert.ok(repeated.error);
});
test("fresh initialization restores CSV state without session mutations", async () => {
  const before = JSON.stringify(real);
  const state = initialState(real); const id = state.workOrders.find(order => order.status === "unplanned")!.id;
  reducer(state, { type: "schedule", workOrderId: id, resourceId: "TDC", date: "2030-01-01", start: 480 });
  assert.equal(JSON.stringify(real), before);
  assert.deepEqual(await loadAppData(undefined, "2026-11-03"), real);
});
