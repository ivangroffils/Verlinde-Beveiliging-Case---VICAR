import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppData, MaintenanceSheet, WorkOrder } from "../src/types/domain.ts";
import { createMaintenanceSelectors, getMaintenanceOverview, maintenanceSummary, matchesMaintenanceFilter, sortMaintenanceRows } from "../src/lib/domain/maintenance.ts";
import { createRelationSelectors } from "../src/lib/domain/relations.ts";
import { formatDate } from "../src/lib/domain/rules.ts";
import { initialState, reducer } from "../src/lib/domain/state.ts";
import { loadAppData } from "../src/lib/data/normalize.ts";

const sheet: MaintenanceSheet = { id: "s", customerId: "c", description: "Branddetectie", category: "Branddetectie", site: "Locatie", lastDate: "2025-01-01", nextDate: "2026-11-02", intervalLabel: "Jaarlijks", intervalMonths: 12 };
function data(): AppData {
  return { today: "2026-11-03", nowMinute: 600, rawPlanning: [], customers: [{ id: "c", name: "Klant" }], sheets: [{ ...sheet }], workOrders: [], workOrderObjects: [], slots: [], executions: [], resources: [{ id: "r", name: "Volledige Naam", role: "T1" }], issues: [], invalidPlanning: [] };
}
function order(state: AppData, id = "WB-1", changes: Partial<WorkOrder> = {}, sheetId = "s", kind = "Onderhoud") {
  const value: WorkOrder = { id, customerId: "c", installation: "Branddetectie", description: "Onderhoud", site: "Locatie", kind: "Algemeen", createdDate: "2026-11-01", sourceStatus: "Planned", status: "unplanned", hasInvalidPlanning: false, ...changes };
  state.workOrders.push(value); state.workOrderObjects.push({ workOrderId: id, sheetId, kind, source: "csv" }); return value;
}
function appointment(state: AppData, workOrderId = "WB-1", date = "2026-11-04", start = 600, end = 720, resourceId = "r") {
  const value = { id: `slot-${state.slots.length}`, workOrderId, date, start, end, resourceId }; state.slots.push(value); return value;
}
const view = (state: AppData) => getMaintenanceOverview(state)[0];

test("no active maintenance order means Te starten independently of maintenance urgency", () => {
  for (const [nextDate, urgency] of [["2026-11-02", "overdue"], ["2026-11-20", "upcoming"], ["2027-01-01", "ok"], [null, "missing"]] as const) {
    const state = data(); state.sheets[0].nextDate = nextDate;
    const row = view(state); assert.equal(row.urgency, urgency); assert.equal(row.state, "to-start"); assert.equal(row.action, "Werkorder maken");
    assert.equal(row.selectedWorkOrder, null); assert.equal(row.appointment, null);
  }
});
test("urgency uses the recorded next date and includes today through day 30", () => {
  for (const [nextDate, urgency] of [["2026-11-02", "overdue"], ["2026-11-03", "upcoming"], ["2026-12-03", "upcoming"], ["2026-12-04", "ok"], ["2026-02-31", "missing"]] as const) {
    const state = data(); state.sheets[0].nextDate = nextDate; assert.equal(view(state).urgency, urgency);
  }
});
test("unknown dates remain actionable and annual fire maintenance never substitutes a new date", () => {
  for (const nextDate of [null, "", "2026-02-31", "invalid"]) {
    const state = data(); state.sheets[0].nextDate = nextDate; order(state); appointment(state);
    const row = view(state); assert.equal(row.urgency, "missing"); assert.equal(row.state, "planned");
    assert.equal(row.action, "Afspraak bekijken"); assert.equal(formatDate(nextDate), "—");
    assert.equal(matchesMaintenanceFilter(row, "missing"), true); assert.equal(state.sheets[0].nextDate, nextDate);
  }
});
test("last maintenance date is context and warnings never replace either status", () => {
  const state = data(); order(state); appointment(state); const before = view(state);
  state.sheets[0].lastDate = "2027-01-01"; const after = view(state);
  assert.equal(after.urgency, before.urgency); assert.equal(after.state, "planned"); assert.equal(after.action, "Afspraak bekijken");
  assert.deepEqual(after.appointment, before.appointment); assert.ok(after.reasons.some(reason => reason.code === "inconsistent-maintenance-dates"));
});
test("Completed and Invoiced history never block a new order, even with newer dates, planning or execution", () => {
  for (const stage of ["Completed", "Invoiced"]) {
    const state = data(); order(state, "old", { sourceStatus: stage, status: "completed", createdDate: "2026-11-03" }); appointment(state, "old");
    state.executions.push({ id: "ex", workOrderId: "old", date: "2026-11-03", start: 600, end: 720, resourceId: "r", source: "csv" });
    assert.equal(view(state).state, "to-start"); assert.equal(view(state).selectedWorkOrder, null); assert.equal(view(state).appointment, null);
    const created = reducer(initialState(state), { type: "create", sheetId: "s" }); assert.equal(created.error, null); assert.equal(view(created).selectedWorkOrder?.id, "TEMP-001");
  }
});
test("WO_OBJ alone determines both the installation link and intervention type", () => {
  const state = data(); order(state, "maintenance", { kind: "Herstelling" }); order(state, "repair", { kind: "Onderhoud", createdDate: "2026-11-03" }, "s", "Herstelling");
  assert.equal(view(state).selectedWorkOrder?.id, "maintenance");
  state.workOrderObjects = []; assert.equal(view(state).state, "to-start");
});
test("only Planned, Implemented and Verified import work orders are administratively active", () => {
  for (const sourceStatus of ["Planned", "Implemented", "Verified", " Planned "]) {
    const state = data(); order(state, "w", { sourceStatus }); assert.equal(view(state).state, "to-plan");
  }
  for (const sourceStatus of ["Completed", "Invoiced", "Unknown", "Nieuw", ""]) {
    const state = data(); order(state, "w", { sourceStatus }); assert.equal(view(state).state, "to-start");
  }
});
test("an active order without future planning or execution needs planning", () => {
  const state = data(); order(state); assert.equal(view(state).state, "to-plan"); assert.equal(view(state).action, "Plannen");
  appointment(state, "WB-1", "2026-11-02"); assert.equal(view(state).state, "to-plan"); assert.equal(view(state).appointment, null);
  assert.equal(createRelationSelectors(state).getAppointmentsForWorkOrder("WB-1").length, 1);
});
test("past appointments never imply future planning or actual execution", () => {
  const state = data(); order(state); appointment(state, "WB-1", "2026-11-03", 570, 690);
  assert.equal(view(state).state, "to-plan"); assert.equal(view(state).execution, null);
  const current = appointment(state, "WB-1", "2026-11-03", 600, 720);
  assert.equal(view(state).state, "planned"); assert.equal(view(state).appointment?.id, current.id);
  state.nowMinute = 601; assert.equal(view(state).state, "to-plan");
});
test("nearest valid future planning of the selected WO is shown with full resource name", () => {
  const state = data(); order(state); appointment(state, "WB-1", "2026-11-10"); appointment(state, "WB-1", "2026-11-05");
  const row = view(state); assert.equal(row.state, "planned"); assert.equal(row.action, "Afspraak bekijken");
  assert.equal(row.appointment?.date, "2026-11-05"); assert.equal(row.appointment?.resource.name, "Volledige Naam");
});
test("unusable or outside-window future planning does not count as Gepland", () => {
  for (const changes of [{ resourceId: "missing" }, { date: "2026-02-31" }, { end: 600 }, { start: 420, end: 540 }, { start: 1020, end: 1140 }]) {
    const state = data(); order(state); Object.assign(appointment(state), changes);
    assert.equal(view(state).state, "to-plan"); assert.equal(view(state).appointment, null);
  }
});
test("execution takes precedence over both future planning and missing maintenance dates", () => {
  const state = data(); order(state); appointment(state); state.sheets[0].nextDate = null;
  state.executions.push({ id: "ex", workOrderId: "WB-1", resourceId: "r", date: "2026-11-02", start: 600, end: 720, source: "csv" });
  const row = view(state); assert.equal(row.urgency, "missing"); assert.equal(row.state, "check-closure"); assert.equal(row.action, "Afsluiting controleren");
  assert.equal(row.appointment?.date, "2026-11-04"); assert.equal(row.execution?.date, "2026-11-02");
});
test("newest active WO is selected by creation date, not its document date or nearest appointment", () => {
  const state = data(); order(state, "newest", { createdDate: "2026-11-03", date: "2025-01-01" });
  order(state, "old", { createdDate: "2026-10-01", date: "2027-01-01" }); appointment(state, "old");
  state.executions.push({ id: "ex", workOrderId: "old", resourceId: "r", date: "2026-11-02", start: 600, end: 720, source: "csv" });
  const row = view(state); assert.equal(row.selectedWorkOrder?.id, "newest"); assert.equal(row.state, "to-plan"); assert.equal(row.appointment, null); assert.equal(row.execution, null);
  assert.ok(row.reasons.some(reason => reason.code === "multiple-active-orders"));
});
test("same or absent creation dates use a stable natural work-order-number tie breaker", () => {
  const state = data(); order(state, "WB-2"); order(state, "WB-10"); assert.equal(view(state).selectedWorkOrder?.id, "WB-10");
  state.workOrders.reverse(); assert.equal(view(state).selectedWorkOrder?.id, "WB-10");
  state.workOrders.forEach(order => { order.createdDate = null; }); assert.equal(view(state).selectedWorkOrder?.id, "WB-10");
});
test("an older active order remains operational even beside newer closed maintenance", () => {
  const state = data(); order(state, "active", { createdDate: "2025-01-01" }); order(state, "closed", { sourceStatus: "Completed", status: "completed", createdDate: "2026-11-03" });
  appointment(state, "closed"); assert.equal(view(state).selectedWorkOrder?.id, "active"); assert.equal(view(state).state, "to-plan");
});
test("create, plan, complete and create again update follow-up without reconstructing maintenance cycles", () => {
  const source = data(), before = structuredClone(source);
  let state = reducer(initialState(source), { type: "create", sheetId: "s" }); assert.equal(view(state).state, "to-plan");
  const duplicate = reducer(state, { type: "create", sheetId: "s" }); assert.equal(duplicate.workOrders.length, state.workOrders.length); assert.ok(duplicate.error);
  state = reducer(state, { type: "schedule", workOrderId: "TEMP-001", resourceId: "r", date: "2026-11-05", start: 600 }); assert.equal(view(state).state, "planned");
  state = reducer(state, { type: "complete", workOrderId: "TEMP-001" }); assert.equal(view(state).state, "to-start"); assert.equal(view(state).selectedWorkOrder, null); assert.equal(view(state).appointment, null);
  assert.equal(state.executions.length, 1); assert.equal(createMaintenanceSelectors(state).getHistory("s")[0].order.id, "TEMP-001");
  state = reducer(state, { type: "create", sheetId: "s" }); assert.equal(view(state).selectedWorkOrder?.id, "TEMP-002");
  assert.deepEqual(state.sheets, before.sheets); assert.deepEqual(source, before);
});
test("completing one of multiple active orders selects the remaining active order", () => {
  const state = data(); order(state, "a", { createdDate: "2026-11-01" }); order(state, "b", { createdDate: "2026-11-02" }); appointment(state, "b");
  const completed = reducer(initialState(state), { type: "complete", workOrderId: "b" }); assert.equal(view(completed).selectedWorkOrder?.id, "a"); assert.equal(view(completed).state, "to-plan");
});
test("default priority follows the specified urgency and follow-up combinations", () => {
  const state = data(); state.sheets = [];
  for (const [id, nextDate] of [["later", "2027-01-01"], ["unknown", null], ["upcoming", "2026-11-20"], ["planned", "2026-01-01"], ["to-plan", "2025-11-01"], ["to-start", "2026-11-02"]] as const) state.sheets.push({ ...sheet, id, nextDate });
  order(state, "p", {}, "planned"); appointment(state, "p"); order(state, "u", {}, "to-plan");
  const rows = getMaintenanceOverview(state);
  assert.deepEqual(sortMaintenanceRows(rows, null).map(row => row.sheet.id), ["to-start", "to-plan", "planned", "upcoming", "unknown", "later"]);
  assert.deepEqual(maintenanceSummary(rows), { overdue: 3, upcoming: 1, toPlan: 1, planned: 1 });
  for (const filter of ["overdue", "upcoming", "ok", "missing", "to-start", "to-plan", "planned", "check-closure"] as const) assert.ok(rows.filter(row => matchesMaintenanceFilter(row, filter)).every(row => row.state === filter || row.urgency === filter));
});
test("actual export gives the expected simple operational actions without changing source values", async () => {
  const source = await loadAppData(undefined, "2026-11-03"), before = structuredClone(source), selector = createMaintenanceSelectors(source);
  for (const id of ["1004", "1062"]) { const row = selector.getMaintenanceAction(id)!; assert.equal(row.urgency, "overdue"); assert.equal(row.state, "check-closure"); assert.equal(row.action, "Afsluiting controleren"); }
  assert.equal(selector.getMaintenanceAction("1197")!.state, "planned");
  assert.equal(selector.getMaintenanceAction("1089")!.state, "to-plan"); assert.equal(selector.getMaintenanceAction("1089")!.selectedWorkOrder?.id, "WB2025-0163");
  assert.equal(selector.getMaintenanceAction("1144")!.state, "to-start"); assert.deepEqual(source, before);
});
