"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays, CircleHelp, ClipboardList, Database, ShieldCheck, TriangleAlert, X, CheckCircle2, PanelLeft } from "lucide-react";
import { useApp } from "./app-provider";
import { Button } from "./ui";
import { DataIssues } from "./data-issues";
import { WorkOrderDrawer } from "./work-order-drawer";
import { formatDate } from "@/lib/domain/rules";
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, dispatch } = useApp();
  const [showIssues, setShowIssues] = useState(false);
  const closeIssues = useCallback(() => setShowIssues(false), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const backlog = state.workOrders.filter(order => order.status === "unplanned").length;
  return <div className="min-h-dvh bg-[#f5f7fa] text-slate-900">
    <a href="#main-content" className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-white p-3 focus:not-sr-only">Naar inhoud</a>
    <aside className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-60 flex-col bg-[#102b39] text-white lg:flex`}>
      <Link href="/" onClick={() => setMenuOpen(false)} className="flex h-24 items-center gap-3 px-6"><span className="flex size-10 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300"><ShieldCheck size={25} /></span><span><span className="block text-lg font-bold tracking-[0.08em]">VERLINDE<span className="text-teal-300">.</span></span><span className="text-[9px] font-medium tracking-[0.1em] text-slate-400">MAINTENANCE PLANNER</span></span></Link>
      <p className="px-7 pb-3 pt-6 text-[10px] font-semibold tracking-[0.18em] text-slate-400">WERKRUIMTE</p>
      <nav aria-label="Hoofdnavigatie" className="space-y-2 px-4">{[{ href: "/", label: "Onderhoud", icon: ClipboardList }, { href: "/planning", label: "Planning", icon: CalendarDays }].map(item => <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} aria-current={pathname === item.href ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium ${pathname === item.href ? "bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-300/15" : "text-slate-300 hover:bg-white/5"}`}><item.icon size={19} />{item.label}{item.href === "/planning" && <span className="ml-auto rounded-md bg-white/10 px-2 py-0.5 text-xs">{backlog}</span>}</Link>)}</nav>
      <div className="mx-5 mt-auto mb-6 rounded-xl border border-white/10 bg-white/5 p-4"><Database size={18} className="mb-2 text-teal-300" /><p className="text-xs font-medium">Lokale BuildDesk-export</p><p className="mt-1 text-xs leading-5 text-slate-400">Alleen prototypegegevens.<br />Geen koppeling met BuildDesk.</p></div>
    </aside>
    {menuOpen && <button className="fixed inset-0 z-20 bg-slate-950/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Menu sluiten" />}
    <div className="lg:pl-60">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-3 sm:px-8"><div className="flex items-center gap-3"><Button variant="quiet" className="lg:hidden" aria-label="Menu openen" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><PanelLeft size={20} /></Button><span className="text-sm text-slate-400">Werkruimte</span><span className="text-slate-300">/</span><span className="text-sm font-semibold">{pathname === "/planning" ? "Planning" : "Onderhoud"}</span></div><div className="flex items-center gap-4"><span className="hidden text-xs text-slate-500 sm:block">Vandaag · {formatDate(state.today)}</span><Button variant="secondary" aria-label="Gegevensproblemen tonen" onClick={() => setShowIssues(true)}><TriangleAlert size={15} className="text-amber-600" /><span className="hidden sm:inline">Gegevensproblemen</span><span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{state.issues.length}</span></Button><span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600" title="Prototypewerkruimte">VM</span></div></header>
      <div className="flex items-center justify-between gap-3 border-b border-amber-200/70 bg-[#fffbeb] px-4 py-2 text-xs text-amber-900 sm:px-8"><span className="flex items-center gap-2"><CircleHelp size={14} className="shrink-0" />Prototype mode — changes reset on reload.</span><span className="hidden items-center gap-1 text-amber-700 sm:flex">CSV-snapshot · 03/11/2026<Database size={12} className="ml-1" /></span></div>
      <main id="main-content" className="mx-auto max-w-[2100px] px-4 py-7 sm:px-8 sm:py-8">{children}</main>
      <footer className="flex flex-wrap justify-between gap-2 px-4 pb-6 text-[11px] text-slate-400 sm:px-8"><span>Verlinde Maintenance Planner</span><span>Lokale data. Overzicht in één oogopslag.</span></footer>
    </div>
    {(state.message || state.error) && <div role={state.error ? "alert" : "status"} className={`fixed bottom-5 left-4 right-4 z-40 mx-auto flex max-w-xl items-start gap-3 rounded-xl border bg-white p-4 shadow-xl ${state.error ? "border-rose-300" : "border-teal-300"}`}>{state.error ? <TriangleAlert size={20} className="shrink-0 text-rose-600" /> : <CheckCircle2 size={20} className="shrink-0 text-teal-600" />}<div className="flex-1 text-sm"><p>{state.error ?? state.message}</p>{state.message?.includes("aangemaakt") && <Link className="mt-2 inline-flex items-center gap-1 font-semibold text-teal-700" href="/planning">Naar planning<ArrowUpRight size={14} /></Link>}</div><Button variant="quiet" className="-my-2 -mr-2" aria-label="Melding sluiten" onClick={() => dispatch({ type: "dismiss" })}><X size={17} /></Button></div>}
    <WorkOrderDrawer />{showIssues && <DataIssues onClose={closeIssues} />}
  </div>;
}
