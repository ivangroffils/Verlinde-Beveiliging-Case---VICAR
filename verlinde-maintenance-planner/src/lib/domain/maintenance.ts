import type { AppData, MaintenanceSheet, Appointment, PlanningSlot } from "../../types/domain.ts";
import { customerName, maintenanceStatus, validIsoDate } from "./rules.ts";

import { createRelationSelectors } from "./relations.ts";

export type MaintenanceSortKey = "customer" | "category" | "lastDate" | "nextDate" | "interval" | "status" | "workOrder" | "appointment";
export type MaintenanceSort = { key: MaintenanceSortKey; direction: "asc" | "desc" } | null;
const collator = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });
const priority = { overdue: 0, upcoming: 1, ok: 2, missing: 3 };
const appointmentKey = (slot: PlanningSlot) => `${slot.date}T${String(slot.start).padStart(4, "0")}`;

export function relevantAppointment(data: AppData, sheetId: string): Appointment | null {
  return createRelationSelectors(data).getRelevantAppointmentForMaintenanceSheet(sheetId);
}
export function nextMaintenanceSort(current: MaintenanceSort, key: MaintenanceSortKey): MaintenanceSort {
  if (current?.key !== key) return { key, direction: "asc" };
  return current.direction === "asc" ? { key, direction: "desc" } : null;
}
export function sortMaintenance(data: AppData, sheets: MaintenanceSheet[], sort: MaintenanceSort): MaintenanceSheet[] {
  const relations = createRelationSelectors(data);
  const appointments = new Map(sheets.map(sheet => [sheet.id, relations.getRelevantAppointmentForMaintenanceSheet(sheet.id)]));
  const orders = new Map(sheets.map(sheet => [sheet.id, relations.getPrimaryWorkOrderForMaintenanceSheet(sheet.id)?.id ?? null]));
  function defaultCompare(a: MaintenanceSheet, b: MaintenanceSheet) {
    return priority[maintenanceStatus(a, data.today)] - priority[maintenanceStatus(b, data.today)]
      || (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999") || collator.compare(a.description, b.description) || collator.compare(a.id, b.id);
  }
  function value(sheet: MaintenanceSheet): string | number | null {
    switch (sort?.key) {
      case "customer": return customerName(data, sheet.customerId);
      case "category": return sheet.category || null;
      case "lastDate": return sheet.lastDate && validIsoDate(sheet.lastDate) ? sheet.lastDate : null;
      case "nextDate": return sheet.nextDate && validIsoDate(sheet.nextDate) ? sheet.nextDate : null;
      case "interval": return ["", "—", "?"].includes(sheet.intervalLabel) ? null : sheet.intervalLabel;
      case "status": return priority[maintenanceStatus(sheet, data.today)];
      case "workOrder": return orders.get(sheet.id) ?? null;
      case "appointment": { const slot = appointments.get(sheet.id); return slot ? appointmentKey(slot) : null; }
      default: return null;
    }
  }
  return [...sheets].sort((a, b) => {
    if (!sort) return defaultCompare(a, b);
    const first = value(a), second = value(b);
    if (first === null || second === null) return first === second ? defaultCompare(a, b) : first === null ? 1 : -1;
    const comparison = typeof first === "number" && typeof second === "number" ? first - second : collator.compare(String(first), String(second));
    const secondary = sort.key === "customer" ? collator.compare(a.description, b.description) : 0;
    return (comparison || secondary) * (sort.direction === "asc" ? 1 : -1) || defaultCompare(a, b);
  });
}
