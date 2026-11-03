import type { AppData, Appointment, WorkOrder } from "../../types/domain.ts";
import { createRelationSelectors } from "./relations.ts";

export const planningHref = (workOrderId: string) => `/planning?wo=${encodeURIComponent(workOrderId)}`;
export function getPlanningSelectors(data: AppData) {
  const relations = createRelationSelectors(data);
  const executedIds = new Set(data.executions.map(execution => execution.workOrderId));
  const usableAppointments = new Map(data.workOrders.map(order => [order.id, relations.getAppointmentsForWorkOrder(order.id)]));
  const canSchedule = (order: WorkOrder) => order.status !== "completed" && !executedIds.has(order.id);
  const schedulableOrders = data.workOrders.filter(canSchedule);
  const backlog = schedulableOrders.filter(order => !(usableAppointments.get(order.id)?.length));
  function getSelection(workOrderId: string | null) {
    const order = relations.workOrdersById.get(workOrderId ?? "") ?? null;
    const appointments = order ? usableAppointments.get(order.id) ?? [] : [];
    const future = order ? relations.getFutureAppointmentsForWorkOrder(order.id)[0] ?? null : null;
    const appointment: Appointment | null = future ?? appointments.at(-1) ?? null;
    const focusAppointment = future ?? (order?.status === "completed" ? appointment : null);
    const error = !workOrderId ? null : !order ? "Deze werkorder bestaat niet." : executedIds.has(order.id) && order.status !== "completed" ? "Uitvoering geregistreerd. Controleer de afsluiting." : order.status === "completed" ? "Deze werkorder is afgewerkt." : null;
    return { order, appointment, focusAppointment, error, canSchedule: Boolean(order && canSchedule(order)), slotId: appointment?.id };
  }
  const getAppointmentKind = (workOrderId: string) => relations.workOrdersById.get(workOrderId)?.status === "completed" ? "history" : executedIds.has(workOrderId) ? "executed" : "active";
  return { schedulableOrders, backlog, getSelection, getAppointmentKind, appointments: [...usableAppointments.values()].flat() };
}

export type PlanningSelectors = ReturnType<typeof getPlanningSelectors>;
