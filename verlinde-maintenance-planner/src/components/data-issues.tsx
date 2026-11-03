"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Dialog } from "./dialog";
import { inputClass } from "./ui";
import type { DataIssue } from "@/types/domain";

const severityLabel = { info: "Informatie", warning: "Waarschuwing", error: "Fout" };
const severityTone = { info: "bg-sky-50 text-sky-700", warning: "bg-amber-50 text-amber-800", error: "bg-rose-50 text-rose-700" };
const rank = { error: 0, warning: 1, info: 2 };

export function DataIssues({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<DataIssue["severity"] | "all">("all");
  const counts = { all: state.issues.length, error: 0, warning: 0, info: 0 };
  state.issues.forEach(issue => counts[issue.severity]++);
  const issues = state.issues.filter(issue => (severity === "all" || issue.severity === severity) && `${issue.message} ${issue.workOrderId ?? ""} ${issue.sheetId ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => rank[a.severity] - rank[b.severity]);

  return <Dialog title="Gegevensproblemen" onClose={onClose}>
    <div className="mb-4 flex flex-wrap gap-2">{(["all", "error", "warning", "info"] as const).map(value => <button key={value} aria-pressed={severity === value} onClick={() => setSeverity(value)} className={`rounded-lg px-3 py-2 text-xs font-medium ${severity === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{value === "all" ? "Alle" : severityLabel[value]} <span className="ml-1 opacity-65">{counts[value]}</span></button>)}</div>
    <label className="relative mb-4 block"><span className="sr-only">Zoeken in gegevensproblemen</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} w-full pl-10`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek melding of werkorder" /></label>
    <p className="mb-3 text-xs text-slate-400">{issues.length} meldingen</p>
    <div className="max-h-[48dvh] space-y-2 overflow-y-auto">{issues.map(issue => {
      const original = state.rawPlanning.find(item => item.file === issue.file && item.row === issue.row);
      return <article key={issue.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded px-2 py-0.5 font-medium ${severityTone[issue.severity]}`}>{severityLabel[issue.severity]}</span>{issue.workOrderId && <span className="font-medium text-slate-600">{issue.workOrderId}</span>}{issue.sheetId && <span className="text-slate-400">Fiche {issue.sheetId}</span>}</div><p className="mt-2 text-sm text-slate-700">{issue.message}</p><details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">Details</summary><p className="mt-2 break-all">{issue.file} · rij {issue.row} · {issue.field}</p>{original && <p className="mt-2 break-words font-mono">{Object.entries(original.raw).map(([key, value]) => `${key}: ${value || "—"}`).join(" · ")}</p>}</details></article>;
    })}{!issues.length && <p className="py-10 text-center text-sm text-slate-500">Geen meldingen.</p>}</div>
  </Dialog>;
}
