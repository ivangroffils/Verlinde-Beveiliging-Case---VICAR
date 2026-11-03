import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeData, loadAppData, type Tables } from "../src/lib/data/normalize.ts";
import { createRelationSelectors, openMaintenanceOrders } from "../src/lib/domain/relations.ts";
import { activeSlots } from "../src/lib/domain/rules.ts";
import { relevantAppointment } from "../src/lib/domain/maintenance.ts";
import { initialState, reducer } from "../src/lib/domain/state.ts";

function tables(): Tables {
  const table = (file: string, rows: Record<string, string>[]) => ({ file, rows: rows.map((raw, index) => ({ row: index + 2, raw })), issues: [] });
  return {
    REL: table("REL.csv", [{ code: "c", naam: "Klant" }]),
    MS_HDR: table("MS_HDR.csv", [
      { nr: "1004", klant: "c", omschrijving: "Branddetectie Hoeve Sabbe", type: "BRAND", laatste: "01/11/2025", volgende: "01/11/2026", frequentie: "1J" },
      { nr: "1005", klant: "c", omschrijving: "Andere installatie", type: "CAM", laatste: "01/11/2025", volgende: "01/11/2026", frequentie: "1J" },
    ]),
    WO_HDR: table("WO_HDR.csv", [
      { nr: "WB2026-0347", klant: "c", fiche: "1005", soort: "Onderhoud", status: "Planned", omschrijving: "Onderhoud brand" },
      { nr: "WB2026-0999", klant: "c", fiche: "1004", soort: "Onderhoud", status: "Planned", omschrijving: "Alleen een headerfiche" },
      { nr: "WB2026-0998", klant: "c", fiche: "", soort: "Onderhoud", status: "Planned", omschrijving: "Losse werkorder" },
    ]),
    WO_OBJ: table("WO_OBJ.csv", [{ werkbon: "WB2026-0347", fiche: "1004", omschrijving: "Branddetectie Hoeve Sabbe", soort: "Onderhoud" }]),
    WO_HRS_PL: table("WO_HRS_PL.csv", [
      { werkbon: "WB2026-0347", datum: "05/11/2026", tech: "WVH", van: "10:00", tot: "12:00" },
      { werkbon: "WB2026-0999", datum: "04/11/2026", tech: "TDC", van: "08:00", tot: "10:00" },
      { werkbon: "WB2026-0998", datum: "06/11/2026", tech: "WVH", van: "08:00", tot: "10:00" },
    ]),
    WO_HRS_EX: table("WO_HRS_EX.csv", [{ werkbon: "WB2026-0347", datum: "04/11/2026", tech: "TDC", van: "08:00", tot: "09:00" }]),
    RES: table("RES.csv", [{ code: "WVH", naam: "Wout Vanhoutte", rol: "T1" }, { code: "TDC", naam: "Tom De Coninck", rol: "T1" }]),
    WO_ART_PL: table("WO_ART_PL.csv", []),
  };
}
const normalized = () => normalizeData(tables(), "2026-11-03", 600);

test("canonical MS_HDR -> WO_OBJ -> WO_HDR -> planned hours -> resource chain resolves the exact appointment", () => {
  const data = normalized(), selectors = createRelationSelectors(data);
  assert.deepEqual(selectors.getWorkOrdersForMaintenanceSheet("1004").map(order => order.id), ["WB2026-0347"]);
  assert.equal(selectors.getManagementSheetForWorkOrder("WB2026-0347")?.id, "1004");
  const appointment = selectors.getRelevantAppointmentForMaintenanceSheet("1004")!;
  assert.equal(appointment.workOrderId, "WB2026-0347"); assert.equal(appointment.date, "2026-11-05");
  assert.equal(appointment.start, 600); assert.equal(appointment.end, 720);
  assert.equal(appointment.resource.id, "WVH"); assert.equal(appointment.resource.name, "Wout Vanhoutte");
  assert.equal(selectors.workOrderObjectsBySheetId.get("1004")?.length, 1);
});
test("a conflicting header fiche never overrides or adds to the WO_OBJ relation", () => {
  const data = normalized(), selectors = createRelationSelectors(data);
  assert.equal(selectors.getWorkOrdersForMaintenanceSheet("1005").length, 0);
  assert.equal(selectors.getAppointmentsForMaintenanceSheet("1005").length, 0);
  assert.deepEqual(selectors.getManagementSheetsForWorkOrder("WB2026-0347").map(sheet => sheet.id), ["1004"]);
  assert.equal(data.workOrders.find(order => order.id === "WB2026-0347")?.installation, "Branddetectie Hoeve Sabbe");
});
test("header-only links are ignored while the work order and its own planning remain usable", () => {
  const data = normalized(), selectors = createRelationSelectors(data);
  const order = selectors.workOrdersById.get("WB2026-0999")!;
  assert.ok(order); assert.equal(order.status, "planned"); assert.equal(order.installation, "Installatie ontbreekt");
  assert.equal(selectors.getManagementSheetForWorkOrder(order.id), null);
  assert.equal(selectors.getWorkOrdersForMaintenanceSheet("1004").some(item => item.id === order.id), false);
  assert.equal(selectors.getAppointmentsForWorkOrder(order.id)[0].resource.name, "Tom De Coninck");
  assert.ok(activeSlots(data).some(slot => slot.workOrderId === order.id));
});
test("a work order with neither header fiche nor WO_OBJ is kept in Planning without an installation relation", () => {
  const data = normalized(), selectors = createRelationSelectors(data);
  assert.equal(selectors.workOrdersById.get("WB2026-0998")?.installation, "Installatie ontbreekt");
  assert.equal(selectors.getManagementSheetForWorkOrder("WB2026-0998"), null);
  assert.equal(selectors.getAppointmentsForWorkOrder("WB2026-0998").length, 1);
  assert.ok(activeSlots(data).some(slot => slot.workOrderId === "WB2026-0998"));
});
test("appointments from a header-only linked order cannot leak into the earlier future appointment selection", () => {
  const data = normalized(), selectors = createRelationSelectors(data);
  assert.deepEqual(selectors.getAppointmentsForMaintenanceSheet("1004").map(slot => slot.workOrderId), ["WB2026-0347"]);
  assert.equal(relevantAppointment(data, "1004")?.date, "2026-11-05");
  assert.equal(selectors.getRelevantAppointmentForMaintenanceSheet("1005"), null);
});
test("removing or changing every WO_HDR.fiche value has no relational or normalization effect", () => {
  const source = tables(), snapshot = structuredClone(source);
  source.WO_HDR.rows.forEach(({ raw }) => { delete raw.fiche; });
  assert.deepEqual(normalizeData(source, "2026-11-03", 600), normalized());
  source.WO_HDR.rows.forEach(({ raw }) => { raw.fiche = "MALFORMED-NOT-A-SHEET"; });
  assert.deepEqual(normalizeData(source, "2026-11-03", 600), normalized());
  assert.equal(snapshot.WO_HDR.rows[0].raw.fiche, "1005");
});
test("missing WO_OBJ never triggers header recovery, and does not remove standalone work orders or hours", () => {
  const source = tables(); source.WO_OBJ.rows = [];
  const data = normalizeData(source, "2026-11-03"), selectors = createRelationSelectors(data);
  assert.equal(data.workOrders.length, 3); assert.equal(data.slots.length, 3);
  assert.ok(data.workOrders.every(order => order.installation === "Installatie ontbreekt"));
  for (const id of ["1004", "1005"]) { assert.equal(selectors.getWorkOrdersForMaintenanceSheet(id).length, 0); assert.equal(selectors.getRelevantAppointmentForMaintenanceSheet(id), null); }
});
test("orphan WO_OBJ references produce issues without recovering from header fiche", () => {
  const source = tables(); source.WO_OBJ.rows.push(
    { row: 3, raw: { werkbon: "MISSING-WO", fiche: "1004", omschrijving: "Niet gebruiken" } },
    { row: 4, raw: { werkbon: "WB2026-0999", fiche: "MISSING-SHEET", omschrijving: "Geen installatie" } },
  );
  const data = normalizeData(source, "2026-11-03"), selectors = createRelationSelectors(data);
  assert.equal(data.workOrderObjects.length, 1);
  assert.equal(selectors.getManagementSheetForWorkOrder("WB2026-0999"), null);
  assert.equal(selectors.workOrdersById.get("WB2026-0999")?.installation, "Installatie ontbreekt");
  assert.ok(data.issues.some(issue => issue.file === "WO_OBJ.csv" && issue.field === "werkbon"));
  assert.ok(data.issues.some(issue => issue.file === "WO_OBJ.csv" && issue.field === "fiche"));
});
test("duplicate object rows do not duplicate orders or appointments, and explicit multiple sheet links remain supported", () => {
  const source = tables(); source.WO_OBJ.rows.push(
    { row: 3, raw: { ...source.WO_OBJ.rows[0].raw } },
    { row: 4, raw: { werkbon: "WB2026-0347", fiche: "1005", omschrijving: "Andere installatie", soort: "Onderhoud" } },
  );
  const selectors = createRelationSelectors(normalizeData(source, "2026-11-03"));
  assert.equal(selectors.getWorkOrdersForMaintenanceSheet("1004").length, 1);
  assert.equal(selectors.getAppointmentsForMaintenanceSheet("1004").length, 1);
  assert.deepEqual(selectors.getManagementSheetsForWorkOrder("WB2026-0347").map(sheet => sheet.id), ["1004", "1005"]);
});
test("executed hours resolve through work order and resource but never become planning appointments", () => {
  const data = normalized(), selectors = createRelationSelectors(data);
  const executed = selectors.getExecutedHoursForWorkOrder("WB2026-0347");
  assert.equal(executed.length, 1); assert.equal(executed[0].date, "2026-11-04"); assert.equal(executed[0].resource.name, "Tom De Coninck");
  assert.equal(selectors.getRelevantAppointmentForMaintenanceSheet("1004")?.date, "2026-11-05");
  const withoutPlanning = createRelationSelectors({ ...data, slots: [] });
  assert.equal(withoutPlanning.getAppointmentsForMaintenanceSheet("1004").length, 0);
  assert.equal(withoutPlanning.getRelevantAppointmentForMaintenanceSheet("1004"), null);
});
test("future preference and most recent past fallback operate only on canonical appointments", () => {
  const data = normalized(); const canonical = data.slots.find(slot => slot.workOrderId === "WB2026-0347")!;
  data.slots.push({ ...canonical, id: "past", date: "2026-11-02" }, { ...canonical, id: "far", date: "2026-11-09" });
  assert.equal(createRelationSelectors(data).getRelevantAppointmentForMaintenanceSheet("1004")?.date, "2026-11-05");
  data.today = "2026-11-10";
  assert.equal(createRelationSelectors(data).getRelevantAppointmentForMaintenanceSheet("1004")?.date, "2026-11-09");
});
test("session work orders get an explicit memory-only object relation, which survives planning and completion", () => {
  const source = tables(); source.WO_OBJ.rows = [];
  const data = normalizeData(source, "2026-11-03"), before = structuredClone(data);
  const created = reducer(initialState(data), { type: "create", sheetId: "1004" });
  assert.equal(created.workOrderObjects.length, 1); assert.equal(created.workOrderObjects[0].source, "session");
  const id = created.workOrders[0].id;
  assert.equal(createRelationSelectors(created).getManagementSheetForWorkOrder(id)?.id, "1004");
  const planned = reducer(created, { type: "schedule", workOrderId: id, resourceId: "WVH", date: "2026-11-07", start: 600 });
  const completed = reducer(planned, { type: "complete", workOrderId: id });
  assert.equal(createRelationSelectors(completed).getRelevantAppointmentForMaintenanceSheet("1004")?.resource.name, "Wout Vanhoutte");
  assert.equal(activeSlots(completed).some(slot => slot.workOrderId === id), false);
  assert.deepEqual(data, before);
});
test("linked historical orders remain discoverable without blocking a new maintenance order", () => {
  const data = normalized(); data.workOrders[0].status = "completed";
  const selectors = createRelationSelectors(data);
  assert.equal(selectors.getWorkOrdersForMaintenanceSheet("1004").length, 1);
  assert.equal(selectors.getPrimaryWorkOrderForMaintenanceSheet("1004"), null);
  assert.equal(openMaintenanceOrders(data, "1004").length, 0);
});
test("real exports preserve every WO_OBJ link and leave all 42 standalone orders unlinked", async () => {
  const data = await loadAppData(undefined, "2026-11-03"), selectors = createRelationSelectors(data);
  assert.equal(data.workOrderObjects.length, 519);
  assert.equal(data.workOrders.filter(order => !selectors.getManagementSheetForWorkOrder(order.id)).length, 42);
  assert.ok(data.workOrders.filter(order => !selectors.getManagementSheetForWorkOrder(order.id)).every(order => order.installation === "Installatie ontbreekt"));
  assert.equal(selectors.getWorkOrdersForMaintenanceSheet("1004").length, 5);
  assert.ok(selectors.getWorkOrdersForMaintenanceSheet("1004").some(order => order.id === "WB2026-0347"));
  assert.equal(selectors.getAppointmentsForWorkOrder("WB2026-0347").length, 0);
});
