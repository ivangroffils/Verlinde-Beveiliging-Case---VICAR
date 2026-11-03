"use client";
import { Check, MapPin, Wrench, AlertTriangle } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, OrderBadge } from "./ui";
import { Dialog } from "./dialog";
import { customerName, formatDate, formatTime } from "@/lib/domain/rules";
export function WorkOrderDrawer() {
  const { state, selectedOrderId, closeOrder, dispatch } = useApp();
  const order = state.workOrders.find(item => item.id === selectedOrderId);
  if (!order) return null;
  const slots = state.slots.filter(slot => slot.workOrderId === order.id);
  const issues = state.issues.filter(issue => issue.workOrderId === order.id);
  const originalRows = state.invalidPlanning.filter(row => row.workOrderId === order.id);
  return <Dialog title="Werkorder" onClose={closeOrder} drawer>
    <div className="mb-6 flex items-center justify-between"><span className="font-mono text-lg font-bold">{order.id}</span><OrderBadge order={order} /></div>
    <h3 className="text-xl font-bold tracking-tight">{customerName(state, order.customerId)}</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">{order.description}</p>
    <div className="my-6 space-y-4 rounded-xl bg-slate-50 p-4 text-sm"><div className="flex gap-3"><Wrench size={18} className="mt-0.5 shrink-0 text-slate-400" /><div><p className="text-xs text-slate-500">Installatie</p><p className="mt-1 font-medium">{order.installation}</p></div></div><div className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-slate-400" /><div><p className="text-xs text-slate-500">Locatie</p><p className="mt-1 font-medium">{order.site}</p></div></div></div>
    <h3 className="mb-3 text-sm font-bold">Planning</h3>
    {slots.length ? slots.map(slot => <dl key={slot.id} className="mb-4 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-4 text-sm"><div><dt className="text-xs text-slate-500">Resource</dt><dd className="mt-1 font-medium">{state.resources.find(item => item.id === slot.resourceId)?.name ?? `Onbekende resource (${slot.resourceId})`}</dd></div><div><dt className="text-xs text-slate-500">Datum</dt><dd className="mt-1 font-medium">{formatDate(slot.date)}</dd></div><div><dt className="text-xs text-slate-500">Starttijd</dt><dd className="mt-1 font-medium">{formatTime(slot.start)}</dd></div><div><dt className="text-xs text-slate-500">Eindtijd</dt><dd className="mt-1 font-medium">{formatTime(slot.end)}</dd></div></dl>) : <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Nog niet ingepland. Plan deze werkorder eerst in om uitvoering te registreren.</p>}
    {issues.length > 0 && <details className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-amber-900"><AlertTriangle size={15} className="mr-2 inline" />{issues.length} gegevensproblemen in de bron</summary><ul className="mt-3 space-y-3 text-xs leading-5 text-amber-950">{issues.map(issue => <li key={issue.id}>{issue.message}<span className="block text-amber-800">{issue.file}, rij {issue.row}, {issue.field}</span></li>)}</ul>{originalRows.map(row => <div key={`${row.file}-${row.row}`} className="mt-3 break-words rounded-md bg-white/70 p-3 font-mono text-xs">Oorspronkelijke planning, rij {row.row}:<br />{Object.entries(row.raw).map(([key, value]) => `${key}: ${value || "(leeg)"}`).join(" · ")}</div>)}</details>}
    <div className="mt-8 border-t border-slate-100 pt-6"><Button className="w-full" disabled={!slots.length || order.status === "completed"} onClick={() => { dispatch({ type: "complete", workOrderId: order.id }); closeOrder(); }}><Check size={17} />Markeren als voltooid</Button><p className="mt-3 text-center text-xs leading-5 text-slate-500">De geplande uren worden als uitvoering geregistreerd.<br />Alleen in deze prototypesessie.</p></div>
  </Dialog>;
}
