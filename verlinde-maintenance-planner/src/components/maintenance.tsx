"use client";

import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, CalendarClock, CheckCircle2, HelpCircle, Plus, Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, inputClass, StatusBadge } from "./ui";
import { customerName, formatDate, formatTime, maintenanceStatus, openMaintenanceOrders } from "@/lib/domain/rules";
import type { MaintenanceSheet, PlanningSlot } from "@/types/domain";

import { nextMaintenanceSort, relevantAppointment, sortMaintenance, type MaintenanceSortKey } from "@/lib/domain/maintenance";

const columns: { key: MaintenanceSortKey; label: string }[] = [
  { key: "customer", label: "Klant / installatie" }, { key: "category", label: "Type" },
  { key: "lastDate", label: "Laatste onderhoud" }, { key: "nextDate", label: "Volgend onderhoud" },
  { key: "interval", label: "Interval" }, { key: "status", label: "Status" },
  { key: "workOrder", label: "Werkorder" }, { key: "appointment", label: "Afspraak" },
];
function Appointment({ slot }: { slot: PlanningSlot | null }) {
  const { state } = useApp();
  if (!slot) return <span className="text-slate-300">—</span>;
  const resource = state.resources.find(item => item.id === slot.resourceId)?.name ?? "—";
  const label = `${formatDate(slot.date)} · ${formatTime(slot.start)}–${formatTime(slot.end)} · ${resource}`;
  return <div className="max-w-56 text-[11px]" title={label}><p className="whitespace-nowrap tabular-nums text-slate-600">{formatDate(slot.date)} · {formatTime(slot.start)}–{formatTime(slot.end)}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{resource}</p></div>;
}

export function MaintenanceOverview() {
  const { state, dispatch, openOrder, search, setSearch, filter, setFilter, maintenanceSort, setMaintenanceSort } = useApp();
  const counts = { all: state.sheets.length, overdue: 0, upcoming: 0, missing: 0, ok: 0 };
  state.sheets.forEach(sheet => counts[maintenanceStatus(sheet, state.today)]++);
  const matching = sortMaintenance(state, state.sheets.filter(sheet =>
    (filter === "all" || maintenanceStatus(sheet, state.today) === filter)
    && `${customerName(state, sheet.customerId)} ${sheet.description}`.toLocaleLowerCase("nl").includes(search.toLocaleLowerCase("nl"))), maintenanceSort);
  const appointments = new Map(matching.map(sheet => [sheet.id, relevantAppointment(state, sheet.id)]));
  const interval = (sheet: MaintenanceSheet) => sheet.intervalLabel === "?" ? "—" : sheet.intervalLabel;

  function orderAction(sheet: MaintenanceSheet) {
    const existing = openMaintenanceOrders(state, sheet.id);
    return existing.length ? <div className="flex flex-col items-start">{existing.map(order => (
      <button key={order.id} onClick={() => openOrder(order.id)} className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline">
        {order.id}<ArrowUpRight size={12} />
      </button>
    ))}</div> : <Button variant="secondary" className="min-h-8 gap-1 whitespace-nowrap px-2 text-[11px]" onClick={() => dispatch({ type: "create", sheetId: sheet.id })}><Plus size={13} />Werkorder maken</Button>;
  }

  return <>
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Onderhoudsoverzicht</h1>
      <span className="text-xs tabular-nums text-slate-400">{state.sheets.length} installaties</span>
    </div>
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        { label: "Achterstallig", value: counts.overdue, icon: AlertTriangle, color: "text-rose-500", filter: "overdue" as const },
        { label: "Binnenkort", value: counts.upcoming, icon: CalendarClock, color: "text-amber-500", filter: "upcoming" as const },
        { label: "Op schema", value: counts.ok, icon: CheckCircle2, color: "text-teal-600", filter: "ok" as const },
        { label: "Ontbrekende gegevens", value: counts.missing, icon: HelpCircle, color: "text-slate-400", filter: "missing" as const },
      ].map(item => <button key={item.label} aria-pressed={filter === item.filter} onClick={() => setFilter(item.filter)} className={`rounded-xl border bg-white px-4 py-3 text-left shadow-xs transition-colors hover:border-teal-300 ${filter === item.filter ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"}`}>
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-500">{item.label}</span><item.icon size={16} className={item.color} /></div>
        <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{item.value}</p>
      </button>)}
    </div>
    <section aria-label="Installaties" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">{[
            { id: "all", label: "Alle" }, { id: "overdue", label: "Achterstallig" },
            { id: "upcoming", label: "Binnenkort" }, { id: "missing", label: "Ontbrekende gegevens" },
          ].map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id as typeof filter)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${filter === item.id ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>{item.label}<span className="text-[10px] tabular-nums opacity-55">{counts[item.id as keyof typeof counts]}</span></button>)}</div>
          <label className="relative w-full sm:w-64"><span className="sr-only">Zoek op klant of installatie</span><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Zoek klant of installatie…" className={`${inputClass} w-full pl-9`} /></label>
        </div>
      </div>
      <div className="border-b border-slate-100 px-4 py-2 md:hidden"><label className="flex items-center justify-between gap-3 text-xs text-slate-400">Sorteren<select aria-label="Sorteer onderhoud" className="max-w-56 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600" value={maintenanceSort ? `${maintenanceSort.key}:${maintenanceSort.direction}` : "default"} onChange={event => { if (event.target.value === "default") setMaintenanceSort(null); else { const [key, direction] = event.target.value.split(":"); setMaintenanceSort({ key: key as MaintenanceSortKey, direction: direction as "asc" | "desc" }); } }}><option value="default">Standaard</option>{columns.flatMap(column => [<option key={`${column.key}:asc`} value={`${column.key}:asc`}>{column.label} ↑</option>, <option key={`${column.key}:desc`} value={`${column.key}:desc`}>{column.label} ↓</option>])}</select></label></div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1120px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-medium uppercase tracking-wide text-slate-400"><tr>
            {columns.map(column => {
              const direction = maintenanceSort?.key === column.key ? maintenanceSort.direction : null;
              const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
              return <th key={column.key} scope="col" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"} className="px-3 py-1.5 first:pl-4 last:pr-4"><button onClick={() => setMaintenanceSort(nextMaintenanceSort(maintenanceSort, column.key))} className={`flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded px-0.5 text-left text-[10px] font-medium uppercase tracking-wide transition-colors hover:text-slate-800 ${direction ? "text-teal-700" : "text-slate-400"}`} aria-label={`Sorteer op ${column.label}`}><span className={column.key === "lastDate" || column.key === "nextDate" ? "max-w-20 whitespace-normal leading-4" : ""}>{column.label}</span><Icon size={11} className={direction ? "" : "opacity-40"} aria-hidden="true" /></button></th>;
            })}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{matching.map(sheet => <tr key={sheet.id} data-sheet-id={sheet.id} className="transition-colors hover:bg-slate-50/80">
            <td className="min-w-44 max-w-72 px-4 py-2.5"><p className="font-semibold text-slate-800">{customerName(state, sheet.customerId)}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-400">{sheet.description}</p></td>
            <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-500">{sheet.category}</td>
            <td className={`px-3 py-2.5 tabular-nums ${sheet.lastDate ? "text-slate-600" : "text-slate-300"}`}>{formatDate(sheet.lastDate)}</td>
            <td className={`px-3 py-2.5 tabular-nums ${maintenanceStatus(sheet, state.today) === "overdue" ? "font-medium text-rose-600" : sheet.nextDate ? "text-slate-600" : "text-slate-300"}`}>{formatDate(sheet.nextDate)}</td>
            <td className="px-3 py-2.5 text-[11px] text-slate-500">{interval(sheet)}</td><td className="px-3 py-2.5"><StatusBadge status={maintenanceStatus(sheet, state.today)} /></td><td className="px-3 py-2.5">{orderAction(sheet)}</td><td className="px-3 py-2.5 pr-4"><Appointment slot={appointments.get(sheet.id) ?? null} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">{matching.map(sheet => <article key={sheet.id} className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{customerName(state, sheet.customerId)}</h3><StatusBadge status={maintenanceStatus(sheet, state.today)} /></div>
        <p className="mt-1 text-xs text-slate-500">{sheet.description}</p><p className="mt-1 text-[11px] text-slate-400">{sheet.category} · {interval(sheet)}</p>
        <dl className="my-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] text-slate-400">Laatste onderhoud</dt><dd className="mt-1 tabular-nums">{formatDate(sheet.lastDate)}</dd></div><div><dt className="text-[10px] text-slate-400">Volgend onderhoud</dt><dd className="mt-1 tabular-nums">{formatDate(sheet.nextDate)}</dd></div><div className="col-span-2"><dt className="mb-1 text-[10px] text-slate-400">Afspraak</dt><dd><Appointment slot={appointments.get(sheet.id) ?? null} /></dd></div></dl>{orderAction(sheet)}
      </article>)}</div>
      {!matching.length && <div className="px-6 py-12 text-center"><Search className="mx-auto mb-3 text-slate-300" size={26} /><h3 className="text-sm font-semibold">Geen installaties gevonden</h3><Button variant="secondary" className="mt-3" onClick={() => { setSearch(""); setFilter("all"); }}>Filters wissen</Button></div>}
      <div className="border-t border-slate-100 px-4 py-3 text-[11px] tabular-nums text-slate-400">{matching.length} van {state.sheets.length} installaties</div>
    </section>
  </>;
}
