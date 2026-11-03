import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, HelpCircle } from "lucide-react";
import type { MaintenanceStatus, WorkOrder } from "@/types/domain";
import { statusLabels } from "@/lib/domain/rules";
export const inputClass = "min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-xs outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15";
export function Button({ children, variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet"; children: ReactNode }) {
  const colors = variant === "primary" ? "border-transparent bg-teal-700 text-white hover:bg-teal-800 shadow-xs" : variant === "secondary" ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs" : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900";
  return <button {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${colors} ${className}`}>{children}</button>;
}
const tones = { overdue: "border-rose-100 bg-rose-50/70 text-rose-700", upcoming: "border-amber-100 bg-amber-50/70 text-amber-800", ok: "border-teal-100 bg-teal-50/70 text-teal-700", missing: "border-slate-100 bg-slate-50 text-slate-600" };
export function StatusBadge({ status }: { status: MaintenanceStatus }) {
  const Icon = { overdue: AlertTriangle, upcoming: Clock3, ok: CheckCircle2, missing: HelpCircle }[status];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${tones[status]}`}><Icon size={13} aria-hidden="true" />{statusLabels[status]}</span>;
}
export function OrderBadge({ order }: { order: WorkOrder }) {
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${order.status === "completed" ? "bg-teal-50 text-teal-800" : order.status === "planned" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>{order.status === "completed" ? "Voltooid" : order.status === "planned" ? "Ingepland" : "Ongepland"}</span>;
}
