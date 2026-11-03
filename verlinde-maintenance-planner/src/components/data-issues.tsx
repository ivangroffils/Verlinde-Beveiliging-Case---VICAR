"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Dialog } from "./dialog";
import { inputClass } from "./ui";
export function DataIssues({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const issues = state.issues.filter(issue => `${issue.message} ${issue.workOrderId ?? ""} ${issue.sheetId ?? ""} ${issue.file}`.toLowerCase().includes(query.toLowerCase()));
  return <Dialog title="Gegevensproblemen" onClose={onClose}>
    <p className="mb-4 text-sm leading-6 text-slate-600">De CSV-export bevat onvolledige of tegenstrijdige gegevens. Bronwaarden blijven behouden. Ongeldige planning wordt nooit automatisch hersteld; actieve werkorders staan dan in de backlog.</p>
    <label className="relative mb-4 block"><span className="sr-only">Zoeken in gegevensproblemen</span><Search size={17} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} w-full pl-10`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek op werkorder, fiche of probleem…" /></label>
    <p className="mb-3 text-xs text-slate-500">{issues.length} meldingen · {state.invalidPlanning.length} ongeldige planningsrijen</p>
    <div className="max-h-[48dvh] space-y-2 overflow-y-auto">{issues.map(issue => {
      const raw = state.invalidPlanning.find(item => item.file === issue.file && item.row === issue.row);
      return <article key={issue.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">{issue.workOrderId && <span>{issue.workOrderId}</span>}{issue.sheetId && <span>Fiche {issue.sheetId}</span>}<span className="font-normal text-slate-500">{issue.field}</span></div><p className="mt-1 text-sm">{issue.message}</p><p className="mt-1 break-all text-xs text-slate-500">{issue.file} · {issue.row ? `rij ${issue.row}` : "bestand"}</p>{raw && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Oorspronkelijke waarden</summary><p className="mt-2 break-words font-mono">{Object.entries(raw.raw).map(([key, value]) => `${key}: ${value || "(leeg)"}`).join(" · ")}</p></details>}</article>;
    })}{!issues.length && <p className="py-10 text-center text-sm text-slate-500">Geen meldingen gevonden.</p>}</div>
  </Dialog>;
}
