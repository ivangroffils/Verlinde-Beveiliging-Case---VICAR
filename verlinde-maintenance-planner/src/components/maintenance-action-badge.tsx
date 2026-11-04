import { CalendarCheck2, CalendarClock, CheckCircle2, PlusCircle } from "lucide-react";
import { maintenanceActionLabels, maintenanceUrgencyLabels, type MaintenanceActionState } from "@/lib/domain/maintenance";
import type { MaintenanceStatus } from "@/types/domain";
import { StatusBadge } from "./ui";

const tones: Record<MaintenanceActionState, string> = {
  "to-start": "border-slate-200 bg-slate-50 text-slate-600",
  "to-plan": "border-amber-100 bg-amber-50/70 text-amber-800",
  planned: "border-teal-100 bg-teal-50/70 text-teal-700",
  "check-closure": "border-sky-100 bg-sky-50/70 text-sky-800",
};
export function MaintenanceActionBadge({ state }: { state: MaintenanceActionState }) {
  const Icon = { "to-start": PlusCircle, "to-plan": CalendarClock, planned: CalendarCheck2, "check-closure": CheckCircle2 }[state];
  return <span data-follow-up={state} title={maintenanceActionLabels[state]} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${tones[state]}`}><Icon size={12} aria-hidden="true" /><span>{maintenanceActionLabels[state]}</span></span>;
}
export function MaintenanceUrgencyBadge({ status }: { status: MaintenanceStatus }) {
  return <span data-urgency={status}><StatusBadge status={status} label={maintenanceUrgencyLabels[status]} /></span>;
}
