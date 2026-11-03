"use client";
import { createContext, useCallback, useContext, useMemo, useReducer, useState, type Dispatch, type ReactNode } from "react";
import type { AppData, AppState, MaintenanceStatus } from "@/types/domain";
import { initialState, reducer, type Action } from "@/lib/domain/state";
import type { MaintenanceSort } from "@/lib/domain/maintenance";
import { createRelationSelectors, type RelationSelectors } from "@/lib/domain/relations";
interface ContextValue {
  relations: RelationSelectors;
  maintenanceSort: MaintenanceSort; setMaintenanceSort: (value: MaintenanceSort) => void;
  state: AppState; dispatch: Dispatch<Action>; selectedOrderId: string | null;
  openOrder: (id: string) => void; closeOrder: () => void;
  search: string; setSearch: (value: string) => void;
  filter: MaintenanceStatus | "all"; setFilter: (value: MaintenanceStatus | "all") => void;
}
const AppContext = createContext<ContextValue | null>(null);
export function AppProvider({ data, children }: { data: AppData; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, data, initialState);
  const relations = useMemo(() => createRelationSelectors(state), [state]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [maintenanceSort, setMaintenanceSort] = useState<MaintenanceSort>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MaintenanceStatus | "all">("all");
  const openOrder = useCallback((id: string) => setSelectedOrderId(id), []);
  const closeOrder = useCallback(() => setSelectedOrderId(null), []);
  return <AppContext.Provider value={{ relations, maintenanceSort, setMaintenanceSort, state, dispatch, selectedOrderId, openOrder, closeOrder, search, setSearch, filter, setFilter }}>{children}</AppContext.Provider>;
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider ontbreekt.");
  return context;
}
