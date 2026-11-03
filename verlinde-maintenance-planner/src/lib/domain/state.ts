import type { AppData, AppState, PlanningSlot, WorkOrder } from "../../types/domain.ts";
import { DEFAULT_DURATION, openMaintenanceOrders, validatePlanning } from "./rules.ts";

export type Action =
  | { type: "create"; sheetId: string }
  | { type: "schedule"; workOrderId: string; resourceId: string; date: string; start: number; slotId?: string }
  | { type: "complete"; workOrderId: string }
  | { type: "dismiss" };
export function initialState(data: AppData): AppState { return { ...data, nextTempId: 1, message: null, error: null }; }
export function reducer(state: AppState, action: Action): AppState {
  const fail = (error: string): AppState => ({ ...state, message: null, error });
  if (action.type === "dismiss") return { ...state, message: null, error: null };
  if (action.type === "create") {
    const sheet = state.sheets.find(item => item.id === action.sheetId);
    if (!sheet) return fail("Deze onderhoudsfiche bestaat niet.");
    if (openMaintenanceOrders(state, sheet.id).length) return fail("Er bestaat al een open onderhoudswerkorder voor deze installatie.");
    let sequence = state.nextTempId;
    while (state.workOrders.some(order => order.id === `TEMP-${String(sequence).padStart(3, "0")}`)) sequence++;
    const id = `TEMP-${String(sequence).padStart(3, "0")}`;
    const order: WorkOrder = { id, customerId: sheet.customerId, sheetIds: [sheet.id], installation: sheet.description, description: `Onderhoud — ${sheet.description}`, site: sheet.site, kind: "Onderhoud", sourceStatus: "Nieuw", status: "unplanned", hasInvalidPlanning: false };
    return { ...state, nextTempId: sequence + 1, workOrders: [order, ...state.workOrders], message: `${id} aangemaakt. De werkorder staat klaar in Planning.`, error: null };
  }
  if (action.type === "schedule") {
    const existing = action.slotId ? state.slots.find(slot => slot.id === action.slotId && slot.workOrderId === action.workOrderId) : undefined;
    if (action.slotId && !existing) return fail("Deze planning bestaat niet meer.");
    if (!action.slotId && state.slots.some(slot => slot.workOrderId === action.workOrderId)) return fail("Deze werkorder is al ingepland. Verplaats het bestaande blok.");
    const duration = existing ? existing.end - existing.start : DEFAULT_DURATION;
    const candidate: PlanningSlot = { id: existing?.id ?? `session-${action.workOrderId}`, workOrderId: action.workOrderId, resourceId: action.resourceId, date: action.date, start: action.start, end: action.start + duration };
    const error = validatePlanning(state, candidate);
    if (error) return fail(error);
    return { ...state, slots: [...state.slots.filter(slot => slot.id !== candidate.id), candidate], workOrders: state.workOrders.map(order => order.id === action.workOrderId ? { ...order, status: "planned" } : order), message: `${action.workOrderId} ${existing ? "verplaatst" : "ingepland"}.`, error: null };
  }
  const order = state.workOrders.find(item => item.id === action.workOrderId);
  if (!order || order.status === "completed") return fail("Deze werkorder is al voltooid of bestaat niet meer.");
  const slots = state.slots.filter(slot => slot.workOrderId === order.id);
  if (!slots.length) return fail("Plan de werkorder eerst in voordat je hem voltooit.");
  return { ...state, workOrders: state.workOrders.map(item => item.id === order.id ? { ...item, status: "completed" } : item), executions: [...state.executions, ...slots.map(slot => ({ ...slot, id: `execution-${slot.id}`, source: "session" as const }))], slots: state.slots.filter(slot => slot.workOrderId !== order.id), message: `${order.id} voltooid. De geplande uren zijn als uitvoering geregistreerd.`, error: null };
}
