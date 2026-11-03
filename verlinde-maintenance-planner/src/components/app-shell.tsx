"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { CalendarDays, ClipboardList, PanelLeft, TriangleAlert } from "lucide-react";
import { useApp } from "./app-provider";
import { BrandLogo } from "./brand-logo";
import { Button } from "./ui";
import { DataIssues } from "./data-issues";
import { MaintenanceDrawer } from "./maintenance-drawer";
import { WorkOrderDrawer } from "./work-order-drawer";
import { AppToast } from "./app-toast";
import { formatDate } from "@/lib/domain/rules";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, planning } = useApp();
  const [showIssues, setShowIssues] = useState(false);
  const closeIssues = useCallback(() => setShowIssues(false), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const backlog = planning.backlog.length;
  const warnings = state.issues.filter(issue => issue.severity !== "info").length;
  const page = pathname === "/planning" ? "Planning" : "Onderhoud";

  return <div className="min-h-dvh bg-[#f5f7fa] text-slate-900">
    <a href="#main-content" className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-white p-3 focus:not-sr-only">Naar inhoud</a>
    <aside className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-52 flex-col bg-[#102b39] text-white xl:flex`}>
      <Link href="/" aria-label="Verlinde Maintenance Planner" onClick={() => setMenuOpen(false)} className="flex h-24 shrink-0 items-center gap-2 px-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-white p-1"><BrandLogo className="h-full w-full" /></span>
        <span><span className="block text-base font-bold tracking-wider">VERLINDE<span className="text-teal-300">.</span></span><span className="mt-1 block text-[9px] font-medium uppercase tracking-wider text-slate-400">Maintenance Planner</span></span>
      </Link>
      <nav aria-label="Hoofdnavigatie" className="space-y-1 px-3 pt-4">
        {[{ href: "/", label: "Onderhoud", icon: ClipboardList }, { href: "/planning", label: "Planning", icon: CalendarDays }].map(item => <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} aria-current={pathname === item.href ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${pathname === item.href ? "bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-300/15" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}><item.icon size={18} />{item.label}{item.href === "/planning" && <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[11px] tabular-nums">{backlog}</span>}</Link>)}
      </nav>
      <p className="mt-auto px-6 py-6 text-[10px] text-slate-500">Verlinde Maintenance Planner</p>
    </aside>
    {menuOpen && <button className="fixed inset-0 z-20 bg-slate-950/50 xl:hidden" onClick={() => setMenuOpen(false)} aria-label="Menu sluiten" />}
    <div className="xl:pl-52">
      <header className="flex min-h-18 items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2"><Button variant="quiet" className="px-2 xl:hidden" aria-label="Menu openen" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><PanelLeft size={19} /></Button><span className="flex size-16 shrink-0 items-center justify-center p-1"><BrandLogo className="h-full w-full" /></span><span className="hidden h-5 border-l border-slate-200 sm:block" /><span className="truncate text-sm font-medium text-slate-600">{page}</span></div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4"><span className="hidden text-xs tabular-nums text-slate-400 sm:block">{formatDate(state.today)}</span><Button variant="quiet" className="gap-1.5 px-2 text-xs font-normal" aria-label="Gegevensproblemen tonen" onClick={() => setShowIssues(true)}><TriangleAlert size={15} className="text-slate-400" /><span className="hidden xl:inline">Gegevensproblemen</span><span className="tabular-nums text-slate-400">{warnings}</span></Button></div>
      </header>
      <main id="main-content" className="mx-auto max-w-[2400px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
    <AppToast key={state.error ?? state.message ?? "idle"} /><WorkOrderDrawer /><MaintenanceDrawer />{showIssues && <DataIssues onClose={closeIssues} />}
  </div>;
}
