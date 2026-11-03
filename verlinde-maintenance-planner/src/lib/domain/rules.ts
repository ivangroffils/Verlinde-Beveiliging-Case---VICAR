import { addDays, format, isValid, parse } from "date-fns";
import type { AppData, MaintenanceSheet, MaintenanceStatus, PlanningSlot, WorkOrder } from "../../types/domain.ts";

export const WINDOW_START = 8 * 60;
export const WINDOW_END = 18 * 60;
export const SLOT_STEP = 30;
export const DEFAULT_DURATION = 120;
export const statusLabels: Record<MaintenanceStatus, string> = {
  overdue: "Achterstallig", upcoming: "Binnenkort", ok: "Op schema", missing: "Ontbrekende gegevens",
};
export function parseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return null;
  const date = parse(trimmed, "dd/MM/yyyy", new Date(2000, 0, 1));
  return isValid(date) && format(date, "dd/MM/yyyy") === trimmed ? format(date, "yyyy-MM-dd") : null;
}
export function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parse(value, "yyyy-MM-dd", new Date(2000, 0, 1));
  return isValid(date) && format(date, "yyyy-MM-dd") === value;
}
export function calendarDate(value: string): Date { return parse(value, "yyyy-MM-dd", new Date(2000, 0, 1)); }
export function formatDate(value: string | null): string { return value ? format(calendarDate(value), "dd/MM/yyyy") : "\u2014"; }
export function parseTime(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) return null;
  const [hours, minutes] = value.trim().split(":").map(Number);
  return hours * 60 + minutes;
}
export function formatTime(value: number): string { return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`; }
export function normalizeInterval(value: string): { label: string; months: number | null } {
  const normalized = value.trim().toLowerCase();
  const months = ({ "1j": 12, "jaarlijks": 12, "12m": 12, "1 x per jaar": 12, "2j": 24, "6m": 6 } as Record<string, number>)[normalized] ?? null;
  return { label: months === 12 ? "Jaarlijks" : months === 24 ? "Elke 2 jaar" : months === 6 ? "Halfjaarlijks" : value.trim() || "\u2014", months };
}
export function maintenanceStatus(sheet: MaintenanceSheet, today: string): MaintenanceStatus {
  if (!sheet.nextDate || !validIsoDate(sheet.nextDate)) return "missing";
  if (sheet.nextDate < today) return "overdue";
  return sheet.nextDate <= format(addDays(calendarDate(today), 30), "yyyy-MM-dd") ? "upcoming" : "ok";
}
export function sourceOrderStatus(value: string): WorkOrder["status"] {
  return ["completed", "invoiced"].includes(value.trim().toLowerCase()) ? "completed" : "unplanned";
}
export function customerName(data: Pick<AppData, "customers">, id: string): string {
  return data.customers.find(customer => customer.id === id)?.name ?? "Onbekende klant";
}
export function activeSlots(data: Pick<AppData, "slots" | "workOrders">): PlanningSlot[] {
  const active = new Set(data.workOrders.filter(order => order.status !== "completed").map(order => order.id));
  return data.slots.filter(slot => active.has(slot.workOrderId));
}
export function overlaps(a: PlanningSlot, b: PlanningSlot): boolean {
  return a.id !== b.id && a.resourceId === b.resourceId && a.date === b.date && a.start < b.end && a.end > b.start;
}
export function validatePlanning(data: Pick<AppData, "resources" | "slots" | "workOrders">, candidate: PlanningSlot, operation: "move" | "resize" = "move"): string | null {
  const order = data.workOrders.find(item => item.id === candidate.workOrderId);
  if (!order || order.status === "completed") return "Deze werkorder is niet beschikbaar voor planning.";
  if (!data.resources.some(resource => resource.id === candidate.resourceId)) return "De gekozen resource bestaat niet.";
  if (!validIsoDate(candidate.date)) return "Kies een geldige planningsdatum.";
  const original = data.slots.find(slot => slot.id === candidate.id);
  const preservesDuration = original && original.end - original.start === candidate.end - candidate.start;
  if (!Number.isInteger(candidate.start) || !Number.isInteger(candidate.end) || candidate.end <= candidate.start || (operation === "move" && candidate.start % SLOT_STEP !== 0) || (candidate.end % SLOT_STEP !== 0 && (operation === "resize" || !preservesDuration))) return "Kies geldige tijden in stappen van 30 minuten; de eindtijd moet na de starttijd liggen.";
  if (candidate.start < WINDOW_START || candidate.end > WINDOW_END) return "Plan de volledige afspraak tussen 08:00 en 18:00.";
  const conflict = activeSlots(data).find(slot => overlaps(candidate, slot));
  return conflict ? `Dit tijdstip overlapt met ${conflict.workOrderId} (${formatTime(conflict.start)}–${formatTime(conflict.end)}).` : null;
}
export function brusselsToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}


export function brusselsMinute(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find(part => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find(part => part.type === "minute")?.value ?? 0);
}
export function snapTime(value: number): number { return Math.round(value / SLOT_STEP) * SLOT_STEP; }
export interface ScheduleInput { workOrderId: string; slotId?: string; resourceId: string; date: string; start: number }
export interface PlanningProposal { slot: PlanningSlot | null; error: string | null }
export function proposePlanning(data: Pick<AppData, "workOrders" | "resources" | "slots">, input: ScheduleInput): PlanningProposal {
  const existing = input.slotId ? data.slots.find(slot => slot.id === input.slotId && slot.workOrderId === input.workOrderId) : undefined;
  if (input.slotId && !existing) return { slot: null, error: "Deze afspraak bestaat niet meer." };
  if (!input.slotId && data.slots.some(slot => slot.workOrderId === input.workOrderId)) return { slot: null, error: "Deze werkorder is al ingepland." };
  const duration = existing ? existing.end - existing.start : DEFAULT_DURATION;
  const slot: PlanningSlot = { id: existing?.id ?? `session-${input.workOrderId}`, workOrderId: input.workOrderId, resourceId: input.resourceId, date: input.date, start: input.start, end: input.start + duration };
  return { slot, error: validatePlanning(data, slot) };
}
export function proposeResize(data: Pick<AppData, "workOrders" | "resources" | "slots">, slotId: string, end: number): PlanningProposal {
  const original = data.slots.find(slot => slot.id === slotId);
  if (!original) return { slot: null, error: "Deze afspraak bestaat niet meer." };
  const slot = { ...original, end };
  return { slot, error: validatePlanning(data, slot, "resize") };
}
