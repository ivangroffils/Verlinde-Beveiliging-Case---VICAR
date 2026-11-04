"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, CalendarClock, Check, ChevronDown, ListFilter, Plus, Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, inputClass } from "./ui";
import { MaintenanceActionBadge, MaintenanceUrgencyBadge } from "./maintenance-action-badge";
import { formatDate, formatTime } from "@/lib/domain/rules";
import { groupMaintenanceRows } from "@/lib/presentation/maintenance";
import { planningHref } from "@/lib/domain/planning";
import { maintenanceSummary, matchesMaintenanceFilter, nextMaintenanceSort, sortMaintenanceRows, type MaintenanceFilter, type MaintenanceOverviewRow, type MaintenanceSortKey } from "@/lib/domain/maintenance";

const MAX_GROUP_ROWS = 10;
const columns: { key: MaintenanceSortKey; label: string }[] = [
  { key: "customer", label: "Klant / installatie" }, { key: "category", label: "Type" },
  { key: "nextDate", label: "Volgend onderhoud" }, { key: "urgency", label: "Urgentie" },
  { key: "status", label: "Werkbonopvolging" }, { key: "workOrder", label: "Actieve WO" },
  { key: "appointment", label: "Afspraak" }, { key: "action", label: "Actie" },
];
export function MaintenancePrimaryAction({ row, onNavigate }: { row: MaintenanceOverviewRow; onNavigate?: () => void }) {
  const { dispatch, openOrder } = useApp();
  if (row.state === "to-start") return <Button className="min-h-8 gap-1.5 px-3 text-xs" title={row.action} onClick={() => dispatch({ type: "create", sheetId: row.sheet.id })}><Plus size={13} /><span className="min-w-0 truncate">{row.action}</span></Button>;
  if ((row.state === "to-plan" || row.state === "planned") && row.selectedWorkOrder) return <Link href={planningHref(row.selectedWorkOrder.id, row.state === "to-plan" ? "place" : "view")} onClick={onNavigate} title={row.action} className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold shadow-xs transition-colors ${row.state === "to-plan" ? "border-teal-700 bg-teal-700 text-white hover:bg-teal-800" : "border-slate-200 bg-white text-teal-700 hover:border-teal-300 hover:bg-teal-50"}`}><CalendarClock size={13} /><span className="min-w-0 truncate">{row.action}</span></Link>;
  return <Button variant="secondary" className="min-h-8 px-3 text-xs" title={row.action} onClick={() => { if (row.selectedWorkOrder) openOrder(row.selectedWorkOrder.id); }}><span className="min-w-0 truncate">{row.action}</span></Button>;
}
function InstallationRow({ row, showCategory = true }: { row: MaintenanceOverviewRow; showCategory?: boolean }) {
  const { openMaintenance } = useApp();
  return <tr data-maintenance-row={row.sheet.id} data-maintenance-state={row.state} data-maintenance-urgency={row.urgency}
    tabIndex={0} aria-label={`Onderhoud bekijken: ${row.customer} — ${row.sheet.description}`}
    onClick={event => { if (event.target instanceof Element && event.target.closest("button,a,input,select,textarea,summary")) return; openMaintenance(row.sheet.id); }}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openMaintenance(row.sheet.id); } }}
    className="cursor-pointer transition-colors hover:bg-teal-50/40 focus-visible:bg-teal-50">
    <td data-column="customer" className="min-w-44 max-w-64 px-4 py-2.5"><button onClick={() => openMaintenance(row.sheet.id)} title={row.customer} className="rounded text-left text-xs font-semibold text-slate-800 hover:text-teal-700">{row.customer}</button><p title={row.sheet.description} className="mt-0.5 text-[11px] leading-4 text-slate-500">{row.sheet.description}</p></td>
    {showCategory && <td className="max-w-28 px-3 py-2.5 text-[11px] leading-4 text-slate-500">{row.sheet.category}</td>}
    <td data-column="nextDate" className={`whitespace-nowrap px-3 py-2.5 text-xs tabular-nums ${row.urgency === "overdue" ? "font-medium text-rose-600" : "text-slate-500"}`}>{formatDate(row.sheet.nextDate)}</td>
    <td data-column="urgency" className="px-3 py-2.5"><MaintenanceUrgencyBadge status={row.urgency} /></td>
    <td data-column="status" className="px-3 py-2.5"><MaintenanceActionBadge state={row.state} /></td>
    <td data-column="workOrder" title={row.selectedWorkOrder?.id} data-active-work-order={row.selectedWorkOrder?.id ?? ""} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium tabular-nums text-slate-600">{row.selectedWorkOrder?.id ?? <span className="font-normal text-slate-300">—</span>}</td>
    <td data-column="appointment" data-appointment title={row.appointment ? `${formatDate(row.appointment.date)} · ${formatTime(row.appointment.start)}–${formatTime(row.appointment.end)} · ${row.appointment.resource.name}` : undefined} className="px-3 py-2.5 text-[11px] leading-4 text-slate-500">{row.appointment ? <><p className="whitespace-nowrap tabular-nums"><span data-appointment-date>{formatDate(row.appointment.date)}</span><span data-appointment-separator> · </span><span data-appointment-time>{formatTime(row.appointment.start)}–{formatTime(row.appointment.end)}</span></p><p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">{row.appointment.resource.name}</p></> : <span className="text-slate-300">—</span>}</td>
    <td data-column="action" className="whitespace-nowrap px-3 py-2.5 pr-4"><MaintenancePrimaryAction row={row} /></td>
  </tr>;
}
function MaintenanceTable({ rows, label, inCard = false }: { rows: MaintenanceOverviewRow[]; label?: string; inCard?: boolean }) {
  const { maintenanceSort, setMaintenanceSort } = useApp();
  const visibleColumns = label ? columns.filter(column => column.key !== "category") : columns;
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (!label || rows.length <= MAX_GROUP_ROWS) {
      container.style.removeProperty("max-height");
      return;
    }
    const table = container.querySelector("table")!;
    const visibleRows = [...table.querySelectorAll<HTMLElement>("[data-maintenance-row]")].slice(0, MAX_GROUP_ROWS);
    const updateHeight = () => {
      // Include the header, up to 10 actual row heights, borders and the horizontal scrollbar.
      const contentHeight = visibleRows[MAX_GROUP_ROWS - 1].getBoundingClientRect().bottom - table.getBoundingClientRect().top;
      container.style.maxHeight = `${contentHeight + container.offsetHeight - container.clientHeight}px`;
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);
    observer.observe(table);
    visibleRows.forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [label, rows, inCard]);
  return (
      <div ref={scrollRef} data-maintenance-scroll tabIndex={0} role="region" aria-label={label ? `Onderhoudstabel ${label}` : "Onderhoudstabel"} className={`${inCard ? "overflow-x-hidden overflow-y-auto" : label ? "overflow-auto" : "overflow-x-auto"} bg-white ${inCard ? "flex-1" : "rounded-xl border border-slate-200 shadow-xs"}`}>
        <table className={`w-full text-left ${inCard ? "maintenance-grid-table" : label ? "min-w-[1020px]" : "min-w-[1120px]"}`} aria-label={label ? `Onderhoud per installatie · ${label}` : "Onderhoud per installatie"}><colgroup>{visibleColumns.map(column => <col key={column.key} data-column={column.key} />)}</colgroup><thead className={`${label ? "sticky top-0 z-10" : ""} border-b border-slate-200 bg-slate-50 text-[10px] font-medium uppercase tracking-wide text-slate-500`}><tr>{visibleColumns.map(column => {
          const direction = maintenanceSort?.key === column.key ? maintenanceSort.direction : null;
          const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
          return <th key={column.key} data-column={column.key} scope="col" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"} className="px-3 py-1.5 first:pl-4 last:pr-4"><button title={column.label} aria-label={`Sorteer op ${column.label}`} onClick={() => setMaintenanceSort(nextMaintenanceSort(maintenanceSort, column.key))} className={`inline-flex min-h-8 items-center gap-1.5 rounded text-left text-[10px] font-medium uppercase tracking-wide hover:text-slate-700 ${direction ? "text-teal-700" : "text-slate-500"}`}><span className={column.key === "nextDate" ? "max-w-20 leading-4" : "whitespace-nowrap"}>{column.label}</span><Icon size={11} aria-hidden="true" className={direction ? "shrink-0" : "shrink-0 opacity-40"} /></button></th>;
        })}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <InstallationRow key={row.sheet.id} row={row} showCategory={!label} />)}{!rows.length && <tr><td colSpan={visibleColumns.length} className="px-4 py-6 text-center text-xs text-slate-400">Geen installaties</td></tr>}</tbody></table>
      </div>
  );
}
function MaintenanceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={`flex cursor-pointer items-center gap-2 text-xs font-medium transition-colors hover:text-teal-700 ${checked ? "text-teal-800" : "text-slate-600"}`}><span className="relative flex shrink-0"><input type="checkbox" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)} className="peer size-4 appearance-none rounded border border-slate-300 bg-white transition-colors checked:border-teal-700 checked:bg-teal-700" /><Check size={12} aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100" /></span>{label}</label>;
}
export function MaintenanceOverview() {
  const { maintenance, search, setSearch, filter, setFilter, maintenanceSort, setMaintenanceSort, groupMaintenanceByCategory, setGroupMaintenanceByCategory, maintenanceGrid, setMaintenanceGrid } = useApp();
  const rows = maintenance.getOverview();
  const summary = maintenanceSummary(rows);
  const matching = sortMaintenanceRows(rows.filter(row => matchesMaintenanceFilter(row, filter)
    && `${row.customer} ${row.sheet.description}`.toLocaleLowerCase("nl").includes(search.toLocaleLowerCase("nl"))), maintenanceSort);
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Welkom, Dirk</h1><p className="mt-1 text-sm text-slate-500">Jouw onderhoudsoverzicht.</p></div><span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium tabular-nums text-slate-500">{rows.length} installaties</span></div>
    <div tabIndex={0} role="region" aria-label="Onderhoudsindicatoren" className="mb-5 overflow-x-auto pb-1"><div className="grid min-w-[800px] grid-cols-4 gap-3">{[
      { label: "Achterstallig", description: "Onderhoudsdatum verstreken", category: "urgency", value: summary.overdue, icon: AlertTriangle, color: "text-rose-500", filter: "overdue" as const },
      { label: "Binnenkort", description: "Binnen de komende 30 dagen", category: "urgency", value: summary.upcoming, icon: CalendarClock, color: "text-amber-500", filter: "upcoming" as const },
      { label: "Nog in te plannen", description: "Actieve WO zonder toekomstige afspraak", category: "follow-up", value: summary.toPlan, icon: CalendarClock, color: "text-teal-600", filter: "to-plan" as const },
      { label: "Afsluiting controleren", description: "Uitgevoerde WO's die nog openstaan", category: "follow-up", value: summary.checkClosure, icon: CheckCircle2, color: "text-sky-600", filter: "check-closure" as const },
    ].map(item => <button key={item.filter} data-summary={item.filter} data-summary-category={item.category} aria-label={`${item.category === "urgency" ? "Onderhoudsurgentie" : "Werkbonopvolging"}: ${item.label}, ${item.value} installaties`} aria-describedby={`kpi-${item.filter}-description`} aria-pressed={filter === item.filter} onClick={() => setFilter(filter === item.filter ? "all" : item.filter)} className={`rounded-xl border px-4 py-3 text-left shadow-xs transition-[background-color,border-color,box-shadow] hover:border-teal-300 hover:shadow-sm ${filter === item.filter ? "border-teal-500 bg-teal-50/60 ring-1 ring-inset ring-teal-500" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-2"><span className="text-xs font-medium text-slate-500">{item.label}</span><item.icon size={16} className={`shrink-0 ${item.color}`} /></div><p data-summary-count className="mt-2 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{item.value}</p><p id={`kpi-${item.filter}-description`} className="mt-1 min-h-8 text-[11px] leading-4 text-slate-500">{item.description}</p></button>)}</div></div>
    <section aria-label="Installaties">
      <div data-maintenance-toolbar className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4"><label className="relative w-full sm:w-64"><span className="sr-only">Zoek op klant of installatie</span><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Zoek klant of installatie…" className={`${inputClass} w-full pl-9 text-xs hover:border-slate-300`} /></label>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative block min-w-0 flex-1 sm:flex-none"><span className="sr-only">Filter onderhoud</span><ListFilter size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select aria-label="Filter onderhoud" value={filter} onChange={event => setFilter(event.target.value as MaintenanceFilter)} className={`${inputClass} w-full cursor-pointer appearance-none truncate pl-9 pr-9 text-xs hover:border-slate-300 sm:w-48`}><option value="all">Alle installaties</option><optgroup label="Onderhoud"><option value="overdue">Achterstallig</option><option value="upcoming">Binnenkort</option><option value="ok">Op schema</option><option value="missing">Onbekend</option></optgroup><optgroup label="Werkorders"><option value="to-start">Te starten</option><option value="to-plan">Te plannen</option><option value="planned">Gepland</option><option value="check-closure">Afsluiting controleren</option></optgroup></select><ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></label>
            <label className="relative block min-w-0 flex-1 sm:flex-none"><span className="sr-only">Sorteer onderhoud</span><ArrowUpDown size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select aria-label="Sorteer onderhoud" value={maintenanceSort ? `${maintenanceSort.key}:${maintenanceSort.direction}` : "default"} onChange={event => { if (event.target.value === "default") setMaintenanceSort(null); else { const [key, direction] = event.target.value.split(":"); setMaintenanceSort({ key: key as MaintenanceSortKey, direction: direction as "asc" | "desc" }); } }} className={`${inputClass} w-full cursor-pointer appearance-none truncate pl-9 pr-9 text-xs hover:border-slate-300 sm:w-56`}><option value="default">Prioriteit</option>{columns.flatMap(option => [<option key={`${option.key}:asc`} value={`${option.key}:asc`}>{option.label} ↑</option>, <option key={`${option.key}:desc`} value={`${option.key}:desc`}>{option.label} ↓</option>])}</select><ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></label>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4"><div className="flex flex-wrap items-center gap-x-5 gap-y-3"><MaintenanceToggle label="Groeperen per categorie" checked={groupMaintenanceByCategory} onChange={setGroupMaintenanceByCategory} />{groupMaintenanceByCategory && <MaintenanceToggle label="Weergeven als raster" checked={maintenanceGrid} onChange={setMaintenanceGrid} />}</div><div className="flex items-center gap-3"><p role="status" aria-live="polite" className="whitespace-nowrap text-[11px] tabular-nums text-slate-500">{matching.length} van {rows.length} installaties</p>{(filter !== "all" || search) && <Button variant="quiet" className="min-h-8 text-xs" onClick={() => { setSearch(""); setFilter("all"); }}>Filters wissen</Button>}</div></div>
      </div>
      {groupMaintenanceByCategory ? <div data-maintenance-layout={maintenanceGrid ? "grid" : "stacked"} className={maintenanceGrid ? "maintenance-category-grid" : "space-y-5"}>{groupMaintenanceRows(matching).map(group => <section key={group.label} data-maintenance-category={group.label} aria-label={group.label} className={`min-w-0 ${maintenanceGrid ? "flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs" : ""}`}>
        <div className={`flex items-center justify-between gap-3 ${maintenanceGrid ? "shrink-0 border-b border-slate-200 px-4 py-3" : "mb-2 px-1"}`}><h2 className="text-sm font-semibold text-slate-700">{group.label}</h2><span data-category-count className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium tabular-nums text-slate-500">{group.rows.length} installaties</span></div>
        <MaintenanceTable rows={group.rows} label={group.label} inCard={maintenanceGrid} />
      </section>)}</div> : <MaintenanceTable rows={matching} />}
      {!matching.length && <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"><Search className="mx-auto mb-3 text-slate-300" size={26} /><h3 className="text-sm font-semibold">Geen installaties gevonden</h3><Button variant="secondary" className="mt-3" onClick={() => { setSearch(""); setFilter("all"); }}>Filters wissen</Button></div>}
    </section>
  </>;
}
