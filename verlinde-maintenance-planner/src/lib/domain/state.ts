import type { AppData, AppState, WorkOrder } from "../../types/domain.ts";
import { openMaintenanceOrders, proposePlanning, proposeResize } from "./rules.ts";

export type Action =
  | { type: "create"; sheetId: string }
  | { type: "schedule"; workOrderId: string; resourceId: string; date: string; start: number; slotId?: string }
  | { type: "resize"; slotId: string; end: number }
  | { type: "complete"; workOrderId: string }
  | { type: "dismiss" }
  | { type: "error"; message: string };
export function initialState(data: AppData): AppState { return { ...data, nextTempId: 1, message: null, error: null }; }
export function reducer(state: AppState, action: Action): AppState {
  const fail = (error: string): AppState => ({ ...state, message: null, error });
  if (action.type === "error") return fail(action.message);
  if (action.type === "dismiss") return { ...state, message: null, error: null };
  if (action.type === "create") {
    const sheet = state.sheets.find(item => item.id === action.sheetId);
    if (!sheet) return fail("Deze onderhoudsfiche bestaat niet.");
    if (openMaintenanceOrders(state, sheet.id).length) return fail("Er bestaat al een open onderhoudswerkorder voor deze installatie.");
    let sequence = state.nextTempId;
    while (state.workOrders.some(order => order.id === `TEMP-${String(sequence).padStart(3, "0")}`)) sequence++;
    const id = `TEMP-${String(sequence).padStart(3, "0")}`;
    const order: WorkOrder = { id, customerId: sheet.customerId, sheetIds: [sheet.id], installation: sheet.description, description: `Onderhoud — ${sheet.description}`, site: sheet.site, kind: "Onderhoud", sourceStatus: "Nieuw", status: "unplanned", hasInvalidPlanning: false };
    return { ...state, nextTempId: sequence + 1, workOrders: [order, ...state.workOrders], message: `${id} aangemaakt.`, error: null };
  }
  if (action.type === "schedule") {
    const proposal = proposePlanning(state, action);
    if (proposal.error || !proposal.slot) return fail(proposal.error ?? "Ongeldig tijdvak.");
    const candidate = proposal.slot;
    return { ...state, slots: [...state.slots.filter(slot => slot.id !== candidate.id), candidate], workOrders: state.workOrders.map(order => order.id === action.workOrderId ? { ...order, status: "planned" } : order), message: action.slotId ? "Afspraak verplaatst" : "Werkorder ingepland", error: null };
  }
  if (action.type === "resize") {
    const proposal = proposeResize(state, action.slotId, action.end);
    if (proposal.error || !proposal.slot) return fail(proposal.error ?? "Ongeldige eindtijd.");
    const candidate = proposal.slot;
    return { ...state, slots: state.slots.map(slot => slot.id === candidate.id ? candidate : slot), message: "Duur aangepast", error: null };
  }
  const order = state.workOrders.find(item => item.id === action.workOrderId);
  if (!order || order.status === "completed") return fail("Deze werkorder is al voltooid of bestaat niet meer.");
  const slots = state.slots.filter(slot => slot.workOrderId === order.id);
  if (!slots.length) return fail("Plan de werkorder eerst in voordat je hem voltooit.");
  return { ...state, workOrders: state.workOrders.map(item => item.id === order.id ? { ...item, status: "completed" } : item), executions: [...state.executions, ...slots.map(slot => ({ ...slot, id: `execution-${slot.id}`, source: "session" as const }))], slots: state.slots.filter(slot => slot.workOrderId !== order.id), message: `${order.id} voltooid.`, error: null };
}
