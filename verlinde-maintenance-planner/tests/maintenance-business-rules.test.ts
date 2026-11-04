import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppData, WorkOrder } from "../src/types/domain.ts";
import { createMaintenanceSelectors, getMaintenanceAction, maintenanceSummary, matchesMaintenanceFilter } from "../src/lib/domain/maintenance.ts";
import { createRelationSelectors } from "../src/lib/domain/relations.ts";
import { getPlanningSelectors, planningHref } from "../src/lib/domain/planning.ts";
import { normalizeData, loadAppData, type Tables } from "../src/lib/data/normalize.ts";
import { initialState, reducer } from "../src/lib/domain/state.ts";
import { brusselsToday, brusselsMinute, proposePlanning, proposeResize } from "../src/lib/domain/rules.ts";

function data(): AppData {
  return { today: "2026-11-03", nowMinute: 600, customers: [{ id: "c", name: "Klant" }],
    sheets: [{ id: "s", customerId: "c", description: "Brand", category: "Branddetectie", site: "Adres", lastDate: "2025-01-01", nextDate: "2026-11-02", intervalMonths: 12, intervalLabel: "Jaarlijks" }],
    workOrders: [], workOrderObjects: [], resources: [{ id: "r", name: "Volledige technicusnaam", role: "Technicus" }], slots: [], executions: [], issues: [], invalidPlanning: [], rawPlanning: [] };
}
function order(d: AppData, id = "w", changes: Partial<WorkOrder> = {}, kind = "Onderhoud") {
  const value: WorkOrder = { id, customerId: "c", installation: "Brand", description: "Onderhoud", site: "Adres", kind: "Algemeen", sourceStatus: "Planned", status: "unplanned", date: "2026-11-01", createdDate: "2026-10-31", ...changes, hasInvalidPlanning: false };
  d.workOrders.push(value); d.workOrderObjects.push({ workOrderId: id, sheetId: "s", kind, source: "csv" }); return value;
}
function execute(d: AppData, id = "w", date = "2026-11-02") { d.executions.push({ id: `ex-${id}`, workOrderId: id, resourceId: "r", date, start: 600, end: 720, source: "csv" }); }
const view = (d: AppData) => getMaintenanceAction(d, "s")!;

test("WO_OBJ intervention classification remains independent for each installation, even when header types disagree", () => {
  const d = data(); order(d, "w", { kind: "Herstelling" }); assert.equal(view(d).state, "to-plan");
  d.sheets.push({ ...d.sheets[0], id: "repair" }); d.workOrderObjects.push({ workOrderId: "w", sheetId: "repair", kind: "Herstelling", source: "csv" });
  const relations = createRelationSelectors(d); assert.equal(relations.getMaintenanceWorkOrders("s").length, 1); assert.equal(relations.getMaintenanceWorkOrders("repair").length, 0);
  d.workOrders[0].kind = "Onderhoud"; assert.equal(getMaintenanceAction(d, "repair")!.state, "to-start");
});
test("unknown and contradictory intervention types stay secondary warnings without header fallback", () => {
  for (const kind of ["", "Algemeen", "Onbekend", "Typfout"]) {
    const d = data(); order(d, "w", { kind: "Onderhoud" }, kind);
    assert.equal(view(d).state, "to-start"); assert.ok(view(d).reasons.some(reason => reason.code === "ambiguous-intervention"));
    assert.equal(createRelationSelectors(d).getMaintenanceWorkOrders("s").length, 0);
  }
  const d = data(); order(d); d.workOrderObjects.push({ ...d.workOrderObjects[0], kind: "Herstelling" });
  assert.equal(view(d).state, "to-plan"); assert.ok(view(d).reasons.some(reason => reason.code === "ambiguous-intervention"));
});
test("real normalization preserves every WO_OBJ kind and header value", async () => {
  const { loadTable } = await import("../src/lib/data/repository.ts");
  const names = ["REL", "MS_HDR", "WO_HDR", "WO_OBJ", "WO_HRS_PL", "WO_HRS_EX", "RES", "WO_ART_PL"] as const;
  const tables = Object.fromEntries(await Promise.all(names.map(async name => [name, await loadTable(name)]))) as Tables;
  const before = structuredClone(tables), d = normalizeData(tables, "2026-11-03");
  assert.equal(d.workOrders.find(order => order.id === "WB2026-0037")?.kind, "Algemeen");
  assert.ok(createRelationSelectors(d).getMaintenanceWorkOrders("1089").some(order => order.id === "WB2026-0037")); assert.deepEqual(tables, before);
});
test("executed active work without any planning requires closure and is absent from the scheduling backlog", () => {
  const d = data(); order(d); execute(d); const row = view(d);
  assert.equal(row.state, "check-closure"); assert.equal(row.action, "Afsluiting controleren"); assert.equal(row.appointment, null);
  assert.equal(row.execution?.resource.name, "Volledige technicusnaam"); assert.equal(getPlanningSelectors(d).backlog.length, 0);
});
test("past planning without actual execution remains Te plannen and does not fabricate execution", () => {
  const d = data(); order(d); d.slots.push({ id: "p", workOrderId: "w", resourceId: "r", date: "2026-11-02", start: 600, end: 720 });
  assert.equal(view(d).state, "to-plan"); assert.equal(view(d).action, "Plannen"); assert.equal(view(d).appointment, null); assert.equal(view(d).execution, null);
  assert.equal(getPlanningSelectors(d).getSelection("w").slotId, "p"); assert.equal(getPlanningSelectors(d).getSelection("w").focusAppointment, null); assert.equal(d.executions.length, 0);
});
test("adding newer closed history cannot change the selected active work order or action", () => {
  const d = data(); order(d, "active", { createdDate: "2025-01-01" }); const before = view(d);
  order(d, "closed", { date: "2026-11-03", createdDate: "2026-11-03", status: "completed", sourceStatus: "Completed" }); execute(d, "closed");
  const after = view(d); assert.equal(after.selectedWorkOrder?.id, before.selectedWorkOrder?.id); assert.equal(after.state, before.state); assert.equal(after.action, before.action); assert.equal(after.execution, null);
});
test("active WO selection is unaffected by historical document dates or newer historical execution", () => {
  const d = data(); order(d, "old-active", { date: null, createdDate: null }); order(d, "new-closed", { createdDate: "2026-11-03", status: "completed", sourceStatus: "Invoiced" }); execute(d, "new-closed");
  assert.equal(view(d).state, "to-plan"); assert.equal(view(d).selectedWorkOrder?.id, "old-active");
});
test("closure with recorded execution needs no plan and preserves execution, dates and original source status", () => {
  const d = data(); order(d); execute(d); const before = structuredClone(d);
  const completed = reducer(initialState(d), { type: "complete", workOrderId: "w" });
  assert.equal(completed.error, null); assert.equal(completed.workOrders[0].status, "completed"); assert.deepEqual(completed.executions, before.executions); assert.deepEqual(completed.sheets, before.sheets);
  assert.equal(view(completed).state, "to-start"); assert.equal(view(completed).selectedWorkOrder, null);
  const history = createMaintenanceSelectors(completed).getHistory("s")[0]; assert.equal(history.order.sourceStatus, "Planned"); assert.equal(history.executions.length, 1); assert.match(history.statusLabel, /Voltooid.*Planned/);
  const duplicate = reducer(completed, { type: "complete", workOrderId: "w" }); assert.deepEqual(duplicate.executions, before.executions); assert.deepEqual(d, before);
});
test("existing execution still blocks new planning, moves and resizing", () => {
  const d = data(); order(d); execute(d); const input = { workOrderId: "w", resourceId: "r", date: "2026-11-05", start: 600 };
  assert.match(proposePlanning(d, input).error!, /Uitvoering/); assert.equal(reducer(initialState(d), { type: "schedule", ...input }).slots.length, 0);
  d.slots.push({ ...input, id: "p", end: 720 }); assert.match(proposePlanning(d, { ...input, slotId: "p", start: 660 }).error!, /Uitvoering/); assert.match(proposeResize(d, "p", 750).error!, /Uitvoering/);
});
test("query selection resolves a standalone WO and its nearest future appointment, without a management link", () => {
  const d = data(); order(d, "W B/1"); d.workOrderObjects = [];
  assert.equal(planningHref("W B/1"), "/planning?wo=W%20B%2F1&mode=view"); assert.equal(getPlanningSelectors(d).getSelection("W B/1").order?.id, "W B/1");
  d.slots.push({ id: "past", workOrderId: "W B/1", resourceId: "r", date: "2026-11-01", start: 600, end: 720 }, { id: "far", workOrderId: "W B/1", resourceId: "r", date: "2026-11-20", start: 600, end: 720 }, { id: "future", workOrderId: "W B/1", resourceId: "r", date: "2026-11-05", start: 600, end: 720 });
  const selection = getPlanningSelectors(d).getSelection("W B/1"); assert.equal(selection.appointment?.id, "future"); assert.equal(selection.focusAppointment?.id, "future"); assert.equal(selection.appointment?.resource.name, "Volledige technicusnaam"); assert.equal(getPlanningSelectors(d).getSelection("unknown").canSchedule, false);
});
test("all linked history is chronological and keeps maintenance, repairs, PL, EX and administrative statuses separate", () => {
  const d = data(); order(d, "maintenance", { date: "2025-11-01", status: "completed", sourceStatus: "Completed" });
  order(d, "repair", { date: "2026-10-01", sourceStatus: "Verified" }, "Herstelling"); execute(d, "maintenance", "2025-11-01");
  order(d, "old", { date: "2024-01-01", status: "completed", sourceStatus: "Invoiced" });
  d.slots.push({ id: "pl", workOrderId: "maintenance", resourceId: "r", date: "2025-10-31", start: 600, end: 720 });
  const before = structuredClone(d), selector = createMaintenanceSelectors(d), history = selector.getHistory("s");
  assert.deepEqual(history.map(entry => entry.order.id), ["repair", "maintenance", "old"]); assert.equal(history[0].kind, "Herstelling"); assert.equal(history[0].statusLabel, "Verified");
  assert.equal(history[1].statusLabel, "Completed"); assert.equal(history[1].appointments[0].date, "2025-10-31"); assert.equal(history[1].executions[0].date, "2025-11-01");
  assert.equal(view(d).state, "to-start"); assert.strictEqual(selector.getHistory("s"), history); assert.deepEqual(d, before);
});
test("overview, filters and detail action share one cached selector result", () => {
  const d = data(); order(d); const selectors = createMaintenanceSelectors(d);
  assert.strictEqual(selectors.getOverview()[0], selectors.getMaintenanceAction("s")); assert.equal(selectors.getMaintenanceAction("unknown"), null);
  const planned = reducer(initialState(d), { type: "schedule", workOrderId: "w", resourceId: "r", date: "2026-11-05", start: 600 });
  const row = view(planned); assert.equal(row.state, "planned"); assert.equal(matchesMaintenanceFilter(row, "planned"), true); assert.equal(maintenanceSummary(createMaintenanceSelectors(planned).getOverview()).toPlan, 0);
  const done = reducer(planned, { type: "complete", workOrderId: "w" }); assert.equal(view(done).state, "to-start"); assert.equal(maintenanceSummary(createMaintenanceSelectors(done).getOverview()).overdue, 1);
});
test("real Lieve Deprez keeps its active WO operational; newer closed work remains only in history", async () => {
  const d = await loadAppData(undefined, "2026-11-03"), before = structuredClone(d), selector = createMaintenanceSelectors(d), row = selector.getMaintenanceAction("1089")!;
  assert.equal(row.urgency, "overdue"); assert.equal(row.state, "to-plan"); assert.equal(row.selectedWorkOrder?.id, "WB2025-0163"); assert.equal(row.action, "Plannen"); assert.equal(row.appointment, null);
  const history = selector.getHistory("1089"); assert.equal(history[0].order.id, "WB2026-0037"); assert.equal(history[0].statusLabel, "Completed"); assert.equal(history[0].executions[0].date, "2026-02-15");
  assert.equal(history.find(entry => entry.order.id === "WB2025-0163")?.appointments[0].date, "2025-08-18"); assert.deepEqual(d, before);
});
test("real Hoeve Sabbe uses its 02/11/2026 execution for closure without manufacturing a plan", async () => {
  const d = await loadAppData(undefined, "2026-11-03"), before = structuredClone(d), row = getMaintenanceAction(d, "1004")!;
  assert.equal(row.state, "check-closure"); assert.equal(row.selectedWorkOrder?.id, "WB2026-0347"); assert.equal(row.execution?.date, "2026-11-02"); assert.equal(row.appointment, null);
  assert.equal(getPlanningSelectors(d).backlog.some(order => order.id === "WB2026-0347"), false);
  const done = reducer(initialState(d), { type: "complete", workOrderId: "WB2026-0347" }); assert.equal(getMaintenanceAction(done, "1004")?.state, "to-start"); assert.deepEqual(done.executions, d.executions); assert.deepEqual(d, before);
});
test("real MS 1197 is overdue and planned despite contradictory maintenance dates", async () => {
  const d = await loadAppData(undefined, "2026-11-03"), before = structuredClone(d), relations = createRelationSelectors(d), selector = createMaintenanceSelectors(d, relations), row = selector.getMaintenanceAction("1197")!;
  assert.equal(row.urgency, "overdue"); assert.equal(row.state, "planned"); assert.equal(row.selectedWorkOrder?.id, "WB2026-0248"); assert.equal(row.action, "Afspraak bekijken");
  assert.deepEqual(row.appointment && { date: row.appointment.date, start: row.appointment.start, end: row.appointment.end, technician: row.appointment.resource.name }, { date: "2026-11-16", start: 480, end: 960, technician: "Wout Vanhoutte" });
  assert.ok(row.reasons.some(reason => reason.code === "inconsistent-maintenance-dates")); assert.strictEqual(row.appointment, relations.getAppointmentsForWorkOrder("WB2026-0248").find(slot => slot.id === row.appointment?.id));
  const selection = getPlanningSelectors(d).getSelection(row.selectedWorkOrder!.id); assert.equal(selection.appointment?.id, row.appointment?.id); assert.equal(selection.appointment?.resourceId, "WVH"); assert.deepEqual(d, before);
});
test("real appointment selection uses Brussels calendar and minute boundaries", async () => {
  const d = await loadAppData(undefined, "2026-11-03");
  for (const [instant, future] of [["2026-11-15T23:30:00Z", true], ["2026-11-16T07:00:00Z", true], ["2026-11-16T07:01:00Z", false]] as const) {
    const now = new Date(instant), atTime = { ...d, today: brusselsToday(now), nowMinute: brusselsMinute(now) }, row = getMaintenanceAction(atTime, "1197")!;
    assert.equal(atTime.today, "2026-11-16"); assert.equal(row.urgency, "overdue"); assert.equal(row.state, future ? "planned" : "to-plan"); assert.equal(Boolean(row.appointment), future);
    assert.equal(createMaintenanceSelectors(atTime).getHistory("1197").find(entry => entry.order.id === "WB2026-0248")!.appointments.length > 0, true);
  }
});
test("actual unknown dates stay reachable while the entire source remains unchanged", async () => {
  const d = await loadAppData(undefined, "2026-11-03"), before = structuredClone(d), rows = createMaintenanceSelectors(d).getOverview();
  assert.equal(rows.length, 193); assert.equal(rows.filter(row => matchesMaintenanceFilter(row, "missing")).length, 185);
  assert.ok(rows.every(row => ["to-start", "to-plan", "planned", "check-closure"].includes(row.state))); assert.deepEqual(d, before);
});


test("KPIs count installations across independent dimensions and exclude closed, repair and duplicate hours", () => {
  const d = data(); order(d, "older", { createdDate: "2025-01-01" }); order(d); execute(d);
  d.executions.push({ ...d.executions[0], id: "ex-second", start: 780, end: 840 });
  d.slots.push({ id: "pl", workOrderId: "w", resourceId: "r", date: "2026-11-16", start: 480, end: 600 }, { id: "pl-second", workOrderId: "w", resourceId: "r", date: "2026-11-17", start: 480, end: 600 });
  for (const [id, kind, sourceStatus] of [["closed", "Onderhoud", "Completed"], ["invoiced", "Onderhoud", "Invoiced"], ["repair", "Herstelling", "Verified"]]) {
    d.sheets.push({ ...d.sheets[0], id, nextDate: "2027-01-01" });
    order(d, id, { sourceStatus, status: sourceStatus === "Verified" ? "unplanned" : "completed" }, kind);
    d.workOrderObjects[d.workOrderObjects.length - 1].sheetId = id;
    execute(d, id);
  }
  const before = structuredClone(d), rows = createMaintenanceSelectors(d).getOverview();
  assert.equal(rows[0].state, "check-closure");
  assert.deepEqual(maintenanceSummary(rows), { overdue: 1, upcoming: 0, toPlan: 0, checkClosure: 1 });
  assert.deepEqual(d, before);
});

test("KPIs recalculate after creation, scheduling and completion without changing urgency", () => {
  const d = data(); d.sheets[0].nextDate = "2026-11-20";
  const summary = (value: AppData) => maintenanceSummary(createMaintenanceSelectors(value).getOverview());
  const expected = { overdue: 0, upcoming: 1, toPlan: 0, checkClosure: 0 };
  let state = initialState(d); assert.deepEqual(summary(state), expected);
  state = reducer(state, { type: "create", sheetId: "s" });
  assert.deepEqual(summary(state), { ...expected, toPlan: 1 });
  state = reducer(state, { type: "schedule", workOrderId: "TEMP-001", resourceId: "r", date: "2026-11-16", start: 480 });
  assert.deepEqual(summary(state), expected);
  state = reducer(state, { type: "complete", workOrderId: "TEMP-001" });
  assert.equal(state.executions.length, 1); assert.deepEqual(summary(state), expected);
  const executed = data(); order(executed); execute(executed);
  assert.deepEqual(summary(executed), { overdue: 1, upcoming: 0, toPlan: 0, checkClosure: 1 });
  const closed = reducer(initialState(executed), { type: "complete", workOrderId: "w" });
  assert.deepEqual(summary(closed), { overdue: 1, upcoming: 0, toPlan: 0, checkClosure: 0 });
});
