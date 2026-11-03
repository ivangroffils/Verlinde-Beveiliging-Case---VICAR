"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, TriangleAlert, X } from "lucide-react";
import { useApp } from "./app-provider";

export function AppToast() {
  const { state, dispatch } = useApp();
  const [paused, setPaused] = useState(false);
  const message = state.error ?? state.message;

  useEffect(() => {
    if (!message || paused) return;
    const timer = setTimeout(() => dispatch({ type: "dismiss" }), state.error ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [message, state.error, paused, dispatch]);

  if (!message) return null;
  const Icon = state.error ? TriangleAlert : CheckCircle2;
  return (
    <div
      role={state.error ? "alert" : "status"}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
      className="fixed bottom-4 left-4 right-4 z-40 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:left-auto sm:max-w-md"
    >
      <Icon size={18} className={`shrink-0 ${state.error ? "text-amber-600" : "text-teal-600"}`} />
      <p className="min-w-0 flex-1 text-sm text-slate-700">{message}</p>
      {state.message?.includes("aangemaakt") && <Link href="/planning" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">Planning<ArrowUpRight size={13} /></Link>}
      <button onClick={() => dispatch({ type: "dismiss" })} aria-label="Melding sluiten" className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={15} /></button>
    </div>
  );
}
