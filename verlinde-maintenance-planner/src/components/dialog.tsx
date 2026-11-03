"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui";
export function Dialog({ title, onClose, children, drawer = false }: { title: string; onClose: () => void; children: ReactNode; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={drawer ? "drawer-title" : "dialog-title"} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className={`fixed bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 ${drawer ? "inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-lg" : "inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-4xl rounded-2xl"}`}>
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5"><h2 id={drawer ? "drawer-title" : "dialog-title"} className="text-lg font-bold">{title}</h2><Button variant="quiet" onClick={onClose} aria-label="Sluiten"><X size={20} /></Button></div>
    <div className="p-6">{children}</div>
  </dialog>;
}
