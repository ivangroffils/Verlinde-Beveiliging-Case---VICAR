export type MaintenanceStatus = "overdue" | "upcoming" | "ok" | "missing";
export type OrderStatus = "unplanned" | "planned" | "completed";
export interface Customer { id: string; name: string }
export interface MaintenanceSheet {
  id: string; customerId: string; description: string; category: string; site: string;
  lastDate: string | null; nextDate: string | null; intervalLabel: string; intervalMonths: number | null;
}
export interface WorkOrder {
  id: string; customerId: string; sheetIds: string[]; installation: string; description: string;
  site: string; kind: string; sourceStatus: string; status: OrderStatus; hasInvalidPlanning: boolean;
}
export interface Resource { id: string; name: string; role: string }
export interface PlanningSlot {
  id: string; workOrderId: string; resourceId: string; date: string; start: number; end: number;
}
export interface Execution extends PlanningSlot { source: "csv" | "session" }
export interface DataIssue {
  id: string; file: string; row: number; field: string; message: string; severity: "info" | "warning" | "error";
  workOrderId?: string; sheetId?: string;
}
export interface InvalidPlanningRow {
  file: string; row: number; workOrderId: string; raw: Record<string, string>;
}
export interface AppData {
  today: string; customers: Customer[]; sheets: MaintenanceSheet[]; workOrders: WorkOrder[];
  resources: Resource[]; slots: PlanningSlot[]; executions: Execution[];
  issues: DataIssue[]; invalidPlanning: InvalidPlanningRow[];
}
export interface AppState extends AppData { nextTempId: number; message: string | null; error: string | null }
