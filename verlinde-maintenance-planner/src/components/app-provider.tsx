"use client";
import { createContext, useCallback, useContext, useMemo, useReducer, useState, type Dispatch, type ReactNode } from "react";
import type { AppData, AppState } from "@/types/domain";
import { initialState, reducer, type Action } from "@/lib/domain/state";
import { createMaintenanceSelectors, type MaintenanceSelectors, type MaintenanceSort, type MaintenanceFilter } from "@/lib/domain/maintenance";
import { createRelationSelectors, type RelationSelectors } from "@/lib/domain/relations";
import { getPlanningSelectors, type PlanningSelectors } from "@/lib/domain/planning";
interface ContextValue {
  planning: PlanningSelectors;
  relations: RelationSelectors; maintenance: MaintenanceSelectors;
  selectedMaintenanceId: string | null; openMaintenance: (id: string) => void; closeMaintenance: () => void;
  maintenanceSort: MaintenanceSort; setMaintenanceSort: (value: MaintenanceSort) => void;
  state: AppState; dispatch: Dispatch<Action>; selectedOrderId: string | null;
  openOrder: (id: string) => void; closeOrder: () => void;
  search: string; setSearch: (value: string) => void;
  filter: MaintenanceFilter; setFilter: (value: MaintenanceFilter) => void;
}
const AppContext = createContext<ContextValue | null>(null);
export function AppProvider({ data, children }: { data: AppData; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, data, initialState);
  const relations = useMemo(() => createRelationSelectors(state), [state]);
  const planning = useMemo(() => getPlanningSelectors(state), [state]);
  const maintenance = useMemo(() => createMaintenanceSelectors(state, relations), [state, relations]);
  const [selectedMaintenanceId, setSelectedMaintenanceId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [maintenanceSort, setMaintenanceSort] = useState<MaintenanceSort>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MaintenanceFilter>("all");
  const openOrder = useCallback((id: string) => { setSelectedMaintenanceId(null); setSelectedOrderId(id); }, []);
  const openMaintenance = useCallback((id: string) => { setSelectedOrderId(null); setSelectedMaintenanceId(id); }, []);
  const closeMaintenance = useCallback(() => setSelectedMaintenanceId(null), []);
  const closeOrder = useCallback(() => setSelectedOrderId(null), []);
  return <AppContext.Provider value={{ planning, selectedMaintenanceId, openMaintenance, closeMaintenance, maintenance, relations, maintenanceSort, setMaintenanceSort, state, dispatch, selectedOrderId, openOrder, closeOrder, search, setSearch, filter, setFilter }}>{children}</AppContext.Provider>;
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider ontbreekt.");
  return context;
}
