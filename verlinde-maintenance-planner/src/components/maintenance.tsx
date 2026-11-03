"use client";

import { AlertTriangle, ArrowDown, ArrowUpRight, CalendarClock, CheckCircle2, HelpCircle, Plus, Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, inputClass, StatusBadge } from "./ui";
import { customerName, formatDate, maintenanceStatus, openMaintenanceOrders } from "@/lib/domain/rules";
import type { MaintenanceSheet, MaintenanceStatus } from "@/types/domain";

const rank: Record<MaintenanceStatus, number> = { overdue: 0, upcoming: 1, ok: 2, missing: 3 };

export function MaintenanceOverview() {
  const { state, dispatch, openOrder, search, setSearch, filter, setFilter } = useApp();
  const counts = { all: state.sheets.length, overdue: 0, upcoming: 0, missing: 0, ok: 0 };
  state.sheets.forEach(sheet => counts[maintenanceStatus(sheet, state.today)]++);
  const matching = state.sheets
    .filter(sheet => (filter === "all" || maintenanceStatus(sheet, state.today) === filter)
      && `${customerName(state, sheet.customerId)} ${sheet.description}`.toLocaleLowerCase("nl").includes(search.toLocaleLowerCase("nl")))
    .sort((a, b) => rank[maintenanceStatus(a, state.today)] - rank[maintenanceStatus(b, state.today)]
      || (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999") || a.description.localeCompare(b.description, "nl"));
  const interval = (sheet: MaintenanceSheet) => sheet.intervalLabel === "?" ? "—" : sheet.intervalLabel;

  function orderAction(sheet: MaintenanceSheet) {
    const existing = openMaintenanceOrders(state, sheet.id);
    return existing.length ? <div className="flex flex-col items-start">{existing.map(order => (
      <button key={order.id} onClick={() => openOrder(order.id)} className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline">
        {order.id}<ArrowUpRight size={12} />
      </button>
    ))}</div> : <Button variant="secondary" className="min-h-8 whitespace-nowrap px-2 text-xs" onClick={() => dispatch({ type: "create", sheetId: sheet.id })}><Plus size={13} />Werkorder maken</Button>;
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
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-medium uppercase tracking-wide text-slate-400"><tr>
            <th className="px-4 py-2.5">Klant / installatie</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Laatste onderhoud</th>
            <th className="px-3 py-2.5"><span className="inline-flex items-center gap-1">Volgend onderhoud<ArrowDown size={11} /></span></th><th className="px-3 py-2.5">Interval</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5">Werkorder</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{matching.map(sheet => <tr key={sheet.id} className="transition-colors hover:bg-slate-50/80">
            <td className="max-w-72 px-4 py-2.5"><p className="font-semibold text-slate-800">{customerName(state, sheet.customerId)}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-400">{sheet.description}</p></td>
            <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-500">{sheet.category}</td>
            <td className={`px-3 py-2.5 tabular-nums ${sheet.lastDate ? "text-slate-600" : "text-slate-300"}`}>{formatDate(sheet.lastDate)}</td>
            <td className={`px-3 py-2.5 tabular-nums ${maintenanceStatus(sheet, state.today) === "overdue" ? "font-medium text-rose-600" : sheet.nextDate ? "text-slate-600" : "text-slate-300"}`}>{formatDate(sheet.nextDate)}</td>
            <td className="px-3 py-2.5 text-[11px] text-slate-500">{interval(sheet)}</td><td className="px-3 py-2.5"><StatusBadge status={maintenanceStatus(sheet, state.today)} /></td><td className="px-4 py-2.5">{orderAction(sheet)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">{matching.map(sheet => <article key={sheet.id} className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{customerName(state, sheet.customerId)}</h3><StatusBadge status={maintenanceStatus(sheet, state.today)} /></div>
        <p className="mt-1 text-xs text-slate-500">{sheet.description}</p><p className="mt-1 text-[11px] text-slate-400">{sheet.category} · {interval(sheet)}</p>
        <dl className="my-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] text-slate-400">Laatste onderhoud</dt><dd className="mt-1 tabular-nums">{formatDate(sheet.lastDate)}</dd></div><div><dt className="text-[10px] text-slate-400">Volgend onderhoud</dt><dd className="mt-1 tabular-nums">{formatDate(sheet.nextDate)}</dd></div></dl>{orderAction(sheet)}
      </article>)}</div>
      {!matching.length && <div className="px-6 py-12 text-center"><Search className="mx-auto mb-3 text-slate-300" size={26} /><h3 className="text-sm font-semibold">Geen installaties gevonden</h3><Button variant="secondary" className="mt-3" onClick={() => { setSearch(""); setFilter("all"); }}>Filters wissen</Button></div>}
      <div className="border-t border-slate-100 px-4 py-3 text-[11px] tabular-nums text-slate-400">{matching.length} van {state.sheets.length} installaties</div>
    </section>
  </>;
}
