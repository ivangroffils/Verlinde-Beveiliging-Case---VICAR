"use client";

import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CalendarCheck2, CalendarClock, Plus, Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, inputClass } from "./ui";
import { MaintenanceActionBadge, MaintenanceUrgencyBadge } from "./maintenance-action-badge";
import { formatDate, formatTime } from "@/lib/domain/rules";
import { planningHref } from "@/lib/domain/planning";
import { maintenanceSummary, matchesMaintenanceFilter, nextMaintenanceSort, sortMaintenanceRows, type MaintenanceFilter, type MaintenanceOverviewRow, type MaintenanceSortKey } from "@/lib/domain/maintenance";

const columns: { key: MaintenanceSortKey; label: string }[] = [
  { key: "customer", label: "Klant / installatie" }, { key: "category", label: "Type" },
  { key: "nextDate", label: "Volgend onderhoud" }, { key: "urgency", label: "Urgentie" },
  { key: "status", label: "Werkbonopvolging" }, { key: "workOrder", label: "Actieve WO" },
  { key: "appointment", label: "Afspraak" }, { key: "action", label: "Actie" },
];
export function MaintenancePrimaryAction({ row, onNavigate }: { row: MaintenanceOverviewRow; onNavigate?: () => void }) {
  const { dispatch, openOrder } = useApp();
  if (row.state === "to-start") return <Button className="min-h-8 gap-1.5 px-3 text-xs" onClick={() => dispatch({ type: "create", sheetId: row.sheet.id })}><Plus size={13} />{row.action}</Button>;
  if ((row.state === "to-plan" || row.state === "planned") && row.selectedWorkOrder) return <Link href={planningHref(row.selectedWorkOrder.id)} onClick={onNavigate} className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold shadow-xs transition-colors ${row.state === "to-plan" ? "border-teal-700 bg-teal-700 text-white hover:bg-teal-800" : "border-slate-200 bg-white text-teal-700 hover:border-teal-300 hover:bg-teal-50"}`}><CalendarClock size={13} />{row.action}</Link>;
  return <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => { if (row.selectedWorkOrder) openOrder(row.selectedWorkOrder.id); }}>{row.action}</Button>;
}
function InstallationRow({ row }: { row: MaintenanceOverviewRow }) {
  const { openMaintenance } = useApp();
  return <tr data-maintenance-row={row.sheet.id} data-maintenance-state={row.state} data-maintenance-urgency={row.urgency}
    tabIndex={0} aria-label={`Onderhoud bekijken: ${row.customer} — ${row.sheet.description}`}
    onClick={event => { if (event.target instanceof Element && event.target.closest("button,a,input,select,textarea,summary")) return; openMaintenance(row.sheet.id); }}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openMaintenance(row.sheet.id); } }}
    className="cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:bg-teal-50">
    <td className="min-w-44 max-w-64 px-4 py-2.5"><button onClick={() => openMaintenance(row.sheet.id)} className="rounded text-left text-xs font-semibold text-slate-800 hover:text-teal-700">{row.customer}</button><p className="mt-0.5 text-[11px] leading-4 text-slate-400">{row.sheet.description}</p></td>
    <td className="max-w-28 px-3 py-2.5 text-[11px] leading-4 text-slate-500">{row.sheet.category}</td>
    <td className={`whitespace-nowrap px-3 py-2.5 text-xs tabular-nums ${row.urgency === "overdue" ? "font-medium text-rose-600" : "text-slate-500"}`}>{formatDate(row.sheet.nextDate)}</td>
    <td className="px-3 py-2.5"><MaintenanceUrgencyBadge status={row.urgency} /></td>
    <td className="px-3 py-2.5"><MaintenanceActionBadge state={row.state} /></td>
    <td data-active-work-order={row.selectedWorkOrder?.id ?? ""} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium tabular-nums text-slate-600">{row.selectedWorkOrder?.id ?? <span className="font-normal text-slate-300">—</span>}</td>
    <td data-appointment className="px-3 py-2.5 text-[11px] leading-4 text-slate-500">{row.appointment ? <><p className="whitespace-nowrap tabular-nums">{formatDate(row.appointment.date)} · {formatTime(row.appointment.start)}–{formatTime(row.appointment.end)}</p><p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">{row.appointment.resource.name}</p></> : <span className="text-slate-300">—</span>}</td>
    <td className="whitespace-nowrap px-3 py-2.5 pr-4"><MaintenancePrimaryAction row={row} /></td>
  </tr>;
}
export function MaintenanceOverview() {
  const { maintenance, search, setSearch, filter, setFilter, maintenanceSort, setMaintenanceSort } = useApp();
  const rows = maintenance.getOverview();
  const summary = maintenanceSummary(rows);
  const matching = sortMaintenanceRows(rows.filter(row => matchesMaintenanceFilter(row, filter)
    && `${row.customer} ${row.sheet.description}`.toLocaleLowerCase("nl").includes(search.toLocaleLowerCase("nl"))), maintenanceSort);
  return <>
    <div className="mb-5 flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-tight">Onderhoudsoverzicht</h1><span className="text-xs tabular-nums text-slate-400">{rows.length} installaties</span></div>
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{[
      { label: "Achterstallig", value: summary.overdue, icon: AlertTriangle, color: "text-rose-500", filter: "overdue" as const },
      { label: "Binnenkort", value: summary.upcoming, icon: CalendarClock, color: "text-amber-500", filter: "upcoming" as const },
      { label: "Te plannen", value: summary.toPlan, icon: CalendarClock, color: "text-amber-500", filter: "to-plan" as const },
      { label: "Gepland", value: summary.planned, icon: CalendarCheck2, color: "text-teal-600", filter: "planned" as const },
    ].map(item => <button key={item.filter} data-summary={item.filter} aria-pressed={filter === item.filter} onClick={() => setFilter(filter === item.filter ? "all" : item.filter)} className={`rounded-xl border bg-white px-4 py-3 text-left shadow-xs transition-colors hover:border-teal-300 ${filter === item.filter ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"}`}><div className="flex items-start justify-between gap-2"><span className="text-xs font-medium text-slate-500">{item.label}</span><item.icon size={16} className={`shrink-0 ${item.color}`} /></div><p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{item.value}</p></button>)}</div>
    <section aria-label="Installaties">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs"><label className="relative w-full sm:w-64"><span className="sr-only">Zoek op klant of installatie</span><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Zoek klant of installatie…" className={`${inputClass} w-full pl-9`} /></label>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><select aria-label="Filter onderhoud" value={filter} onChange={event => setFilter(event.target.value as MaintenanceFilter)} className={`${inputClass} min-w-0 flex-1 text-xs sm:flex-none`}><option value="all">Alle installaties</option><optgroup label="Onderhoud"><option value="overdue">Achterstallig</option><option value="upcoming">Binnenkort</option><option value="ok">Op schema</option><option value="missing">Onbekend</option></optgroup><optgroup label="Werkorders"><option value="to-start">Te starten</option><option value="to-plan">Te plannen</option><option value="planned">Gepland</option><option value="check-closure">Afsluiting controleren</option></optgroup></select>
          <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none"><ArrowUpDown size={14} className="hidden shrink-0 text-slate-400 sm:block" aria-hidden="true" /><select aria-label="Sorteer onderhoud" value={maintenanceSort ? `${maintenanceSort.key}:${maintenanceSort.direction}` : "default"} onChange={event => { if (event.target.value === "default") setMaintenanceSort(null); else { const [key, direction] = event.target.value.split(":"); setMaintenanceSort({ key: key as MaintenanceSortKey, direction: direction as "asc" | "desc" }); } }} className={`${inputClass} w-full min-w-0 text-xs sm:w-auto`}><option value="default">Prioriteit</option>{columns.flatMap(option => [<option key={`${option.key}:asc`} value={`${option.key}:asc`}>{option.label} ↑</option>, <option key={`${option.key}:desc`} value={`${option.key}:desc`}>{option.label} ↓</option>])}</select></label>
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between gap-3"><p role="status" aria-live="polite" className="text-xs tabular-nums text-slate-400">{matching.length} van {rows.length} installaties</p>{(filter !== "all" || search) && <Button variant="quiet" className="min-h-8 text-xs" onClick={() => { setSearch(""); setFilter("all"); }}>Filters wissen</Button>}</div>
      <div data-maintenance-scroll tabIndex={0} role="region" aria-label="Onderhoudstabel" className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full min-w-[1120px] text-left" aria-label="Onderhoud per installatie"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-medium uppercase tracking-wide text-slate-400"><tr>{columns.map(column => {
          const direction = maintenanceSort?.key === column.key ? maintenanceSort.direction : null;
          const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
          return <th key={column.key} scope="col" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"} className="px-3 py-1.5 first:pl-4 last:pr-4"><button aria-label={`Sorteer op ${column.label}`} onClick={() => setMaintenanceSort(nextMaintenanceSort(maintenanceSort, column.key))} className={`inline-flex min-h-8 items-center gap-1.5 rounded text-left text-[10px] font-medium uppercase tracking-wide hover:text-slate-700 ${direction ? "text-teal-700" : "text-slate-400"}`}><span className={column.key === "nextDate" ? "max-w-20 leading-4" : "whitespace-nowrap"}>{column.label}</span><Icon size={11} aria-hidden="true" className={direction ? "shrink-0" : "shrink-0 opacity-40"} /></button></th>;
        })}</tr></thead><tbody className="divide-y divide-slate-100">{matching.map(row => <InstallationRow key={row.sheet.id} row={row} />)}</tbody></table>
      </div>
      {!matching.length && <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"><Search className="mx-auto mb-3 text-slate-300" size={26} /><h3 className="text-sm font-semibold">Geen installaties gevonden</h3><Button variant="secondary" className="mt-3" onClick={() => { setSearch(""); setFilter("all"); }}>Filters wissen</Button></div>}
    </section>
  </>;
}
