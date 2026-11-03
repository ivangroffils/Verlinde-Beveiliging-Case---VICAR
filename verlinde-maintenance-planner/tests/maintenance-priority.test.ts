import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppData, MaintenanceStatus } from "../src/types/domain.ts";
import { getMaintenanceOverview, nextMaintenanceSort, sortMaintenanceRows, type MaintenanceActionState, type MaintenanceOverviewRow, type MaintenanceSortKey } from "../src/lib/domain/maintenance.ts";

const priorities: readonly (readonly [MaintenanceStatus, MaintenanceActionState])[] = [
  ["overdue", "to-start"], ["overdue", "to-plan"], ["overdue", "check-closure"], ["overdue", "planned"],
  ["upcoming", "to-start"], ["upcoming", "to-plan"], ["missing", "to-start"], ["missing", "to-plan"],
  ["upcoming", "check-closure"], ["missing", "check-closure"], ["upcoming", "planned"], ["missing", "planned"],
  ["ok", "check-closure"], ["ok", "to-plan"], ["ok", "planned"], ["ok", "to-start"],
];
function row(urgency: MaintenanceStatus, status: MaintenanceActionState, id = `${urgency}-${status}`): MaintenanceOverviewRow {
  const nextDate = { overdue: "2025-11-01", upcoming: "2026-11-20", missing: null, ok: "2027-01-01" }[urgency];
  const data: AppData = { today: "2026-11-03", nowMinute: 600, rawPlanning: [], customers: [{ id: "c", name: "Klant" }], resources: [{ id: "r", name: "Technicus", role: "T" }],
    sheets: [{ id, customerId: "c", description: id, category: "Camera", site: "Adres", nextDate, lastDate: "2024-01-01", intervalMonths: 12, intervalLabel: "Jaarlijks" }],
    workOrders: [], workOrderObjects: [], slots: [], executions: [], issues: [], invalidPlanning: [] };
  if (status !== "to-start") {
    data.workOrders.push({ id: `WB-${id}`, customerId: "c", installation: id, description: "Onderhoud", site: "Adres", kind: "Onderhoud", sourceStatus: "Planned", status: "unplanned", createdDate: "2026-11-01", hasInvalidPlanning: false });
    data.workOrderObjects.push({ workOrderId: `WB-${id}`, sheetId: id, kind: "Onderhoud", source: "csv" });
    const hours = { id: `hours-${id}`, workOrderId: `WB-${id}`, date: "2026-11-16", resourceId: "r", start: 480, end: 600 };
    if (status === "planned") data.slots.push(hours);
    if (status === "check-closure") data.executions.push({ ...hours, date: "2026-11-02", source: "csv" });
  }
  const result = getMaintenanceOverview(data)[0]; assert.equal(result.state, status); assert.equal(result.urgency, urgency); return result;
}

test("Prioriteit uses exactly the requested 16 urgency and follow-up combinations", () => {
  const rows = priorities.map(([urgency, state]) => row(urgency, state)), before = structuredClone(rows);
  assert.equal(new Set(rows.map(value => `${value.urgency}:${value.state}`)).size, 16);
  assert.deepEqual(sortMaintenanceRows([...rows].reverse(), null).map(value => `${value.urgency}:${value.state}`), priorities.map(value => value.join(":")));
  assert.deepEqual(rows, before);
});
test("within a priority group dates are chronological with missing dates last, then customer names break ties", () => {
  const earlier = row("overdue", "to-plan", "old"); earlier.sheet.nextDate = "2024-01-01"; earlier.customer = "Zulu";
  const alpha = row("overdue", "to-plan", "alpha"); alpha.sheet.nextDate = "2025-01-01"; alpha.customer = "Alpha";
  const beta = row("overdue", "to-plan", "beta"); beta.sheet.nextDate = "2025-01-01"; beta.customer = "Beta";
  const missing = row("overdue", "to-plan", "missing"); missing.sheet.nextDate = null; missing.customer = "Aardvark";
  const invalid = row("overdue", "to-plan", "invalid"); invalid.sheet.nextDate = "invalid"; invalid.customer = "Zebra";
  const rows = [invalid, beta, missing, alpha, earlier];
  assert.deepEqual(sortMaintenanceRows(rows, null).map(value => value.sheet.id), ["old", "alpha", "beta", "missing", "invalid"]);
});
test("equal priority, next date and customer have stable installation and identifier tie breakers", () => {
  const alpha = row("missing", "to-start", "1"), zulu = row("missing", "to-start", "2");
  alpha.sheet.description = "Alpha"; zulu.sheet.description = "Zulu";
  assert.deepEqual(sortMaintenanceRows([zulu, alpha], null).map(value => value.sheet.id), ["1", "2"]);
  zulu.sheet.description = "Alpha"; assert.deepEqual(sortMaintenanceRows([zulu, alpha], null).map(value => value.sheet.id), ["1", "2"]);
});
test("all eight table columns support ascending, descending and returning to Prioriteit", () => {
  for (const key of ["customer", "category", "nextDate", "urgency", "status", "workOrder", "appointment", "action"] as MaintenanceSortKey[]) {
    const asc = nextMaintenanceSort(null, key), desc = nextMaintenanceSort(asc, key);
    assert.deepEqual(asc, { key, direction: "asc" }); assert.deepEqual(desc, { key, direction: "desc" }); assert.equal(nextMaintenanceSort(desc, key), null);
  }
});
test("type and work-order columns sort alphabetically and by natural document number", () => {
  const first = row("overdue", "to-plan", "1"), second = row("overdue", "to-plan", "2");
  first.sheet.category = "Zulu"; second.sheet.category = "Alpha"; first.selectedWorkOrder!.id = "WB-10"; second.selectedWorkOrder!.id = "WB-2";
  for (const key of ["category", "workOrder"] as const) {
    assert.equal(sortMaintenanceRows([first, second], { key, direction: "asc" })[0].sheet.id, "2");
    assert.equal(sortMaintenanceRows([first, second], { key, direction: "desc" })[0].sheet.id, "1");
  }
});
test("appointment sorting uses actual date and time and keeps missing values last in both directions", () => {
  const first = row("overdue", "planned", "1"), second = row("overdue", "planned", "2"), missing = row("overdue", "to-start", "3");
  first.appointment!.date = "2026-11-05"; first.appointment!.start = 480;
  second.appointment!.date = "2026-11-04"; second.appointment!.start = 960;
  const rows = [missing, first, second], before = structuredClone(rows);
  assert.deepEqual(sortMaintenanceRows(rows, { key: "appointment", direction: "asc" }).map(value => value.sheet.id), ["2", "1", "3"]);
  assert.deepEqual(sortMaintenanceRows(rows, { key: "appointment", direction: "desc" }).map(value => value.sheet.id), ["1", "2", "3"]);
  assert.deepEqual(rows, before);
  second.appointment!.date = first.appointment!.date;
  assert.equal(sortMaintenanceRows(rows, { key: "appointment", direction: "asc" })[0].sheet.id, "1");
});
test("action sorting uses the displayed action text without changing status or work-order selection", () => {
  const start = row("overdue", "to-start"), plan = row("overdue", "to-plan"), planned = row("overdue", "planned"), close = row("overdue", "check-closure");
  const rows = [start, plan, planned, close], before = structuredClone(rows);
  assert.deepEqual(sortMaintenanceRows(rows, { key: "action", direction: "asc" }).map(value => value.action), ["Afsluiting controleren", "Afspraak bekijken", "Plannen", "Werkorder maken"]);
  assert.deepEqual(rows, before);
});
