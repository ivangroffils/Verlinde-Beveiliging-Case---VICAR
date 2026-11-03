import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppData, MaintenanceSheet, PlanningSlot } from "../src/types/domain.ts";
import { normalizeData, type Tables } from "../src/lib/data/normalize.ts";
import { brusselsMinute, proposePlanning, proposeResize, snapTime } from "../src/lib/domain/rules.ts";
import { nextMaintenanceSort, relevantAppointment, sortMaintenance, type MaintenanceSortKey } from "../src/lib/domain/maintenance.ts";
import { initialState, reducer } from "../src/lib/domain/state.ts";

const sheet: MaintenanceSheet = { id: "1", customerId: "c1", description: "Zulu", category: "Camera", site: "Locatie", lastDate: "2026-11-02", nextDate: "2026-11-02", intervalLabel: "Jaarlijks", intervalMonths: 12 };
function data(): AppData {
  return { today: "2026-11-03", nowMinute: 600, rawPlanning: [], customers: [{ id: "c1", name: "Zebra" }, { id: "c2", name: "Alpha" }], sheets: [sheet, { ...sheet, id: "2", customerId: "c2", description: "Alpha", category: "Branddetectie", lastDate: "2025-01-01", nextDate: "2026-11-05", intervalLabel: "Halfjaarlijks", intervalMonths: 6 }], resources: [{ id: "r", name: "Volledige Naam", role: "T1" }], workOrders: [{ id: "WB-10", customerId: "c1", installation: "Zulu", description: "Onderhoud", site: "Locatie", kind: "Onderhoud", sourceStatus: "Planned", status: "unplanned", hasInvalidPlanning: false }, { id: "WB-2", customerId: "c2", installation: "Alpha", description: "Onderhoud", site: "Locatie", kind: "Onderhoud", sourceStatus: "Planned", status: "unplanned", hasInvalidPlanning: false }], workOrderObjects: [{ workOrderId: "WB-10", sheetId: "1", source: "csv" }, { workOrderId: "WB-2", sheetId: "2", source: "csv" }], slots: [], executions: [], issues: [], invalidPlanning: [] };
}
function slot(changes: Partial<PlanningSlot> = {}): PlanningSlot { return { id: "slot", workOrderId: "WB-10", resourceId: "r", date: "2026-11-03", start: 600, end: 720, ...changes }; }
function csv(raw: Record<string, string>): Tables {
  const empty = (name: string) => ({ file: `${name}.csv`, rows: [], issues: [] });
  return {
    REL: { ...empty("REL"), rows: [{ row: 2, raw: { code: "c1", naam: "Zebra" } }] }, RES: { ...empty("RES"), rows: [{ row: 2, raw: { code: "r", naam: "Volledige Naam", rol: "T1" } }] },
    MS_HDR: { ...empty("MS_HDR"), rows: [{ row: 2, raw: { nr: "1", klant: "c1", omschrijving: "Zulu" } }] },
    WO_HDR: { ...empty("WO_HDR"), rows: [{ row: 2, raw: { nr: "WB-10", klant: "c1", fiche: "1", status: "Planned", soort: "Onderhoud" } }] },
    WO_OBJ: { ...empty("WO_OBJ"), rows: [{ row: 2, raw: { werkbon: "WB-10", fiche: "1", omschrijving: "Zulu", soort: "Onderhoud" } }] }, WO_HRS_PL: { ...empty("WO_HRS_PL"), rows: [{ row: 2, raw }] }, WO_HRS_EX: empty("WO_HRS_EX"), WO_ART_PL: empty("WO_ART_PL"),
  };
}

test("equal valid planned times normalize to two hours without changing raw dates, resources or links", () => {
  const raw = { werkbon: "WB-10", datum: "03/11/2026", tech: "r", van: "10:00", tot: "10:00" };
  const source = csv(raw), before = structuredClone(source);
  const normalized = normalizeData(source, "2026-11-03");
  assert.equal(normalized.slots[0].start, 600); assert.equal(normalized.slots[0].end, 720);
  assert.equal(normalized.slots[0].date, "2026-11-03"); assert.equal(normalized.slots[0].resourceId, "r");
  assert.equal(normalized.slots[0].workOrderId, "WB-10"); assert.equal(normalized.workOrders[0].status, "planned");
  assert.deepEqual(normalized.rawPlanning[0].raw, raw); assert.deepEqual(source, before);
  assert.ok(normalized.issues.some(issue => issue.severity === "info" && issue.message.includes("Nulduur")));
  const state = reducer(initialState(normalized), { type: "resize", slotId: normalized.slots[0].id, end: 750 });
  assert.deepEqual(state.rawPlanning, normalized.rawPlanning);
});
test("zero-duration rule never repairs missing or invalid times or other invalid fields", () => {
  for (const changes of [{ van: "", tot: "" }, { van: "bad", tot: "bad" }, { van: "24:00", tot: "24:00" }, { datum: "31/02/2026" }, { tech: "missing" }, { werkbon: "missing" }]) {
    const raw = { werkbon: "WB-10", datum: "03/11/2026", tech: "r", van: "10:00", tot: "10:00", ...changes };
    const normalized = normalizeData(csv(raw), "2026-11-03");
    assert.equal(normalized.slots.length, 0); assert.equal(normalized.invalidPlanning.length, 1);
    assert.deepEqual(normalized.rawPlanning[0].raw, raw);
  }
});
test("zero-length planning outside the working window retains its date and receives a warning", () => {
  const normalized = normalizeData(csv({ werkbon: "WB-10", datum: "03/11/2026", tech: "r", van: "17:00", tot: "17:00" }), "2026-11-03");
  assert.equal(normalized.slots[0].end, 1140); assert.equal(normalized.slots[0].date, "2026-11-03");
  assert.ok(normalized.issues.some(issue => issue.severity === "warning" && issue.message.includes("buiten")));
});
test("zero-length execution is not fabricated from the planned-duration rule", () => {
  const tables = csv({ werkbon: "WB-10", datum: "03/11/2026", tech: "r", van: "10:00", tot: "10:00" });
  tables.WO_HRS_EX.rows = structuredClone(tables.WO_HRS_PL.rows);
  const normalized = normalizeData(tables, "2026-11-03");
  assert.equal(normalized.slots.length, 1); assert.equal(normalized.executions.length, 0);
});
test("appointment selection prefers the nearest future booking across explicitly linked orders", () => {
  const state = data(); state.workOrderObjects[1].sheetId = "1";
  state.slots = [slot({ id: "old", date: "2026-11-02" }), slot({ id: "far", date: "2026-11-08" }), slot({ id: "near", workOrderId: "WB-2", date: "2026-11-05" })];
  assert.equal(relevantAppointment(state, "1")?.id, "near");
  assert.equal(relevantAppointment(state, "2"), null);
});
test("past appointment fallback chooses the most recent date and start time", () => {
  const state = data(); state.slots = [slot({ id: "older", date: "2026-10-30" }), slot({ id: "morning", date: "2026-11-02", start: 480 }), slot({ id: "recent", date: "2026-11-02", start: 600 })];
  assert.equal(relevantAppointment(state, "1")?.id, "recent");
});
test("today's appointment is compared with the current Brussels minute", () => {
  const state = data(); state.slots = [slot({ id: "past", start: 570 }), slot({ id: "future", start: 630 }), slot({ id: "now", start: 600 })];
  assert.equal(relevantAppointment(state, "1")?.id, "now");
  state.nowMinute = 601; assert.equal(relevantAppointment(state, "1")?.id, "future");
  assert.equal(brusselsMinute(new Date("2026-11-03T09:30:00Z")), 630);
});
test("unusable appointments and unrelated references are excluded", () => {
  const state = data(); state.slots = [slot({ resourceId: "unknown" }), slot({ date: "2026-02-31" }), slot({ start: 600, end: 600 }), slot({ workOrderId: "unrelated" })];
  assert.equal(relevantAppointment(state, "1"), null);
});
test("completed imported planning and completed session appointments remain available to the overview", () => {
  const state = data(); state.slots = [slot({ date: "2026-11-02" })]; state.workOrders[0].status = "completed";
  assert.equal(relevantAppointment(state, "1")?.id, "slot");
  state.workOrders[0].status = "planned";
  const completed = reducer(initialState(state), { type: "complete", workOrderId: "WB-10" });
  assert.equal(relevantAppointment(completed, "1")?.date, "2026-11-02");
});
test("each sort header cycles ascending, descending and default", () => {
  for (const key of ["customer", "category", "lastDate", "nextDate", "interval", "status", "workOrder", "appointment"] as MaintenanceSortKey[]) {
    const asc = nextMaintenanceSort(null, key); assert.deepEqual(asc, { key, direction: "asc" });
    const desc = nextMaintenanceSort(asc, key); assert.deepEqual(desc, { key, direction: "desc" });
    assert.equal(nextMaintenanceSort(desc, key), null);
  }
  assert.deepEqual(nextMaintenanceSort({ key: "status", direction: "desc" }, "customer"), { key: "customer", direction: "asc" });
});
test("text, date, interval and document sorting use their actual values in both directions", () => {
  const state = data();
  for (const key of ["customer", "category", "lastDate", "nextDate", "interval", "workOrder"] as MaintenanceSortKey[]) {
    const expected = key === "nextDate" ? ["1", "2"] : ["2", "1"];
    assert.deepEqual(sortMaintenance(state, state.sheets, { key, direction: "asc" }).map(row => row.id), expected, key);
    assert.deepEqual(sortMaintenance(state, state.sheets, { key, direction: "desc" }).map(row => row.id), [...expected].reverse(), key);
  }
});
test("customer sorting also orders installations alphabetically for the same customer", () => {
  const state = data(); state.sheets[1] = { ...state.sheets[1], customerId: "c1" };
  assert.equal(sortMaintenance(state, state.sheets, { key: "customer", direction: "asc" })[0].id, "2");
  assert.equal(sortMaintenance(state, state.sheets, { key: "customer", direction: "desc" })[0].id, "1");
});
test("missing maintenance dates and missing appointments stay last in both directions", () => {
  const state = data(); state.sheets.push({ ...sheet, id: "missing", lastDate: null, nextDate: null });
  state.slots = [slot({ id: "later", date: "2026-11-05", start: 600 }), slot({ id: "earlier", workOrderId: "WB-2", date: "2026-11-05", start: 480 })];
  for (const key of ["lastDate", "nextDate", "appointment"] as const) for (const direction of ["asc", "desc"] as const) assert.equal(sortMaintenance(state, state.sheets, { key, direction }).at(-1)?.id, "missing");
  assert.equal(sortMaintenance(state, state.sheets, { key: "appointment", direction: "asc" })[0].id, "2");
  assert.equal(sortMaintenance(state, state.sheets, { key: "appointment", direction: "desc" })[0].id, "1");
});
test("status sorting follows urgency priority and sorting never mutates source rows", () => {
  const state = data(); state.sheets = [sheet, { ...sheet, id: "soon", nextDate: "2026-11-05" }, { ...sheet, id: "ok", nextDate: "2027-01-01" }, { ...sheet, id: "missing", nextDate: null }];
  const before = structuredClone(state.sheets);
  assert.deepEqual(sortMaintenance(state, state.sheets, { key: "status", direction: "asc" }).map(row => row.id), ["1", "soon", "ok", "missing"]);
  assert.deepEqual(sortMaintenance(state, state.sheets, { key: "status", direction: "desc" }).map(row => row.id), ["missing", "ok", "soon", "1"]);
  assert.deepEqual(state.sheets, before);
});
test("drag proposals and commits agree exactly and preserve duration", () => {
  const state = initialState(data());
  const input = { workOrderId: "WB-10", resourceId: "r", date: "2026-11-05", start: 630 };
  const proposal = proposePlanning(state, input), planned = reducer(state, { type: "schedule", ...input });
  assert.deepEqual(planned.slots[0], proposal.slot); assert.equal(planned.message, "Werkorder ingepland");
  const moved = reducer(planned, { type: "schedule", ...input, slotId: planned.slots[0].id, start: 780 });
  assert.equal(moved.slots[0].end, 900); assert.equal(moved.message, "Afspraak verplaatst");
});
test("resize changes only end time and the next move preserves the resized duration", () => {
  const state = data(); state.slots = [slot()]; state.workOrders[0].status = "planned";
  const proposal = proposeResize(state, "slot", 780);
  const resized = reducer(initialState(state), { type: "resize", slotId: "slot", end: 780 });
  assert.deepEqual(resized.slots[0], proposal.slot);
  assert.deepEqual(resized.slots[0], { ...state.slots[0], end: 780 }); assert.equal(resized.message, "Duur aangepast");
  const moved = reducer(resized, { type: "schedule", workOrderId: "WB-10", slotId: "slot", resourceId: "r", date: "2026-11-04", start: 480 });
  assert.equal(moved.slots[0].end, 660);
});
test("resize previews detect overlap, boundaries, zero duration and unsnapped endpoints without mutating planning", () => {
  const state = data(); state.slots = [slot(), slot({ id: "other", workOrderId: "WB-2", start: 780, end: 900 })];
  for (const end of [600, 570, 735, 810, 1110]) {
    const before = structuredClone(state.slots), proposal = proposeResize(state, "slot", end);
    assert.ok(proposal.error, String(end));
    const failed = reducer(initialState(state), { type: "resize", slotId: "slot", end });
    assert.equal(failed.error, proposal.error); assert.deepEqual(failed.slots, before);
  }
  assert.equal(proposeResize(state, "slot", 780).error, null);
  assert.ok(proposeResize(state, "missing", 780).error);
});
test("resizing retains a non-grid imported start and snaps only the end", () => {
  const state = data(); state.slots = [slot({ start: 485, end: 560 })];
  const resized = reducer(initialState(state), { type: "resize", slotId: "slot", end: 600 });
  assert.equal(resized.error, null); assert.equal(resized.slots[0].start, 485); assert.equal(resized.slots[0].end, 600);
  assert.equal(snapTime(614), 600); assert.equal(snapTime(615), 630);
});
test("completed orders cannot be resized and rejected drag previews leave planning unchanged", () => {
  const state = data(); state.slots = [slot()]; state.workOrders[0].status = "completed";
  assert.ok(proposeResize(state, "slot", 780).error);
  const before = structuredClone(state.slots);
  const failed = reducer(initialState(state), { type: "error", message: "Geen geldig tijdvak gekozen." });
  assert.deepEqual(failed.slots, before);
});
