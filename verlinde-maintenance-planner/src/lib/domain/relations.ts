import type { AppData, Appointment, Execution, PlanningSlot, ResolvedExecution, WorkOrderObject } from "../../types/domain.ts";
import { validIsoDate } from "./rules.ts";

const documentOrder = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });
const appointmentKey = (slot: PlanningSlot) => `${slot.date}T${String(slot.start).padStart(4, "0")}`;
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  items.forEach(item => { const id = key(item); const group = groups.get(id) ?? []; group.push(item); groups.set(id, group); });
  return groups;
}
function usableHours(slot: PlanningSlot): boolean {
  return validIsoDate(slot.date) && Number.isInteger(slot.start) && Number.isInteger(slot.end)
    && slot.start >= 0 && slot.start < 1440 && slot.end > slot.start;
}
export function createRelationSelectors(data: AppData) {
  const workOrdersById = new Map(data.workOrders.map(order => [order.id, order]));
  const managementSheetsById = new Map(data.sheets.map(sheet => [sheet.id, sheet]));
  const resourcesByCode = new Map(data.resources.map(resource => [resource.id, resource]));
  const validObjects = data.workOrderObjects.filter(object => workOrdersById.has(object.workOrderId) && managementSheetsById.has(object.sheetId));
  const workOrderObjectsBySheetId = groupBy(validObjects, object => object.sheetId);
  const workOrderObjectsByWorkOrderId = groupBy(validObjects, object => object.workOrderId);
  const plannedHoursByWorkOrderId = groupBy(data.slots, slot => slot.workOrderId);
  const executedHoursByWorkOrderId = groupBy(data.executions, execution => execution.workOrderId);

  function getWorkOrdersForMaintenanceSheet(sheetId: string) {
    const ids = new Set((workOrderObjectsBySheetId.get(sheetId) ?? []).map(object => object.workOrderId));
    return [...ids].flatMap(id => { const order = workOrdersById.get(id); return order ? [order] : []; })
      .sort((a, b) => documentOrder.compare(a.id, b.id));
  }
  function getManagementSheetsForWorkOrder(workOrderId: string) {
    const ids = new Set((workOrderObjectsByWorkOrderId.get(workOrderId) ?? []).map(object => object.sheetId));
    return [...ids].flatMap(id => { const sheet = managementSheetsById.get(id); return sheet ? [sheet] : []; });
  }
  function getManagementSheetForWorkOrder(workOrderId: string) {
    return getManagementSheetsForWorkOrder(workOrderId)[0] ?? null;
  }
  function getOpenMaintenanceWorkOrders(sheetId: string) {
    return getWorkOrdersForMaintenanceSheet(sheetId).filter(order => order.status !== "completed" && order.kind.toLowerCase() === "onderhoud");
  }
  function getPrimaryWorkOrderForMaintenanceSheet(sheetId: string) {
    return getOpenMaintenanceWorkOrders(sheetId)[0] ?? getWorkOrdersForMaintenanceSheet(sheetId).at(-1) ?? null;
  }
  function resolveHours<T extends PlanningSlot>(hours: readonly T[]): (T & { resource: AppData["resources"][number] })[] {
    return hours.flatMap(slot => {
      const resource = resourcesByCode.get(slot.resourceId);
      return resource && usableHours(slot) ? [{ ...slot, resource }] : [];
    });
  }
  function getAppointmentsForWorkOrder(workOrderId: string): Appointment[] {
    if (!workOrdersById.has(workOrderId)) return [];
    return resolveHours(plannedHoursByWorkOrderId.get(workOrderId) ?? [])
      .sort((a, b) => appointmentKey(a).localeCompare(appointmentKey(b)) || documentOrder.compare(a.id, b.id));
  }
  function getExecutedHoursForWorkOrder(workOrderId: string): ResolvedExecution[] {
    if (!workOrdersById.has(workOrderId)) return [];
    return resolveHours<Execution>(executedHoursByWorkOrderId.get(workOrderId) ?? []);
  }
  function getAppointmentsForMaintenanceSheet(sheetId: string): Appointment[] {
    return getWorkOrdersForMaintenanceSheet(sheetId).flatMap(order => getAppointmentsForWorkOrder(order.id))
      .sort((a, b) => appointmentKey(a).localeCompare(appointmentKey(b)) || documentOrder.compare(a.workOrderId, b.workOrderId) || documentOrder.compare(a.id, b.id));
  }
  function getRelevantAppointmentForMaintenanceSheet(sheetId: string): Appointment | null {
    const candidates = getAppointmentsForMaintenanceSheet(sheetId);
    const reference = `${data.today}T${String(data.nowMinute ?? 0).padStart(4, "0")}`;
    return candidates.find(slot => appointmentKey(slot) >= reference) ?? candidates.at(-1) ?? null;
  }
  return {
    workOrdersById, managementSheetsById, resourcesByCode, workOrderObjectsBySheetId, workOrderObjectsByWorkOrderId,
    plannedHoursByWorkOrderId, executedHoursByWorkOrderId,
    getWorkOrdersForMaintenanceSheet, getManagementSheetsForWorkOrder, getManagementSheetForWorkOrder,
    getOpenMaintenanceWorkOrders, getPrimaryWorkOrderForMaintenanceSheet, getAppointmentsForWorkOrder, getExecutedHoursForWorkOrder,
    getAppointmentsForMaintenanceSheet, getRelevantAppointmentForMaintenanceSheet,
  };
}
export type RelationSelectors = ReturnType<typeof createRelationSelectors>;
export function openMaintenanceOrders(data: AppData, sheetId: string) {
  return createRelationSelectors(data).getOpenMaintenanceWorkOrders(sheetId);
}
export function createSessionWorkOrderObject(workOrderId: string, sheetId: string): WorkOrderObject {
  return { workOrderId, sheetId, source: "session" };
}
