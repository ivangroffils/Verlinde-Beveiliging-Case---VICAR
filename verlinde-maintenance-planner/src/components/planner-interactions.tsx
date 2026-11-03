"use client";

import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useDraggable } from "@dnd-kit/core";
import type { PlanningSlot } from "@/types/domain";
import type { PlanningProposal } from "@/lib/domain/rules";
import { SLOT_STEP, snapTime, WINDOW_END, WINDOW_START } from "@/lib/domain/rules";
import { useApp } from "./app-provider";

export interface DragSource { workOrderId: string; slotId?: string }
export interface DropTarget { resourceId: string; date: string; start: number }
export interface Point { x: number; y: number }
export interface ResizeDraft { slotId: string; end: number; kind: "pointer" | "keyboard" }
interface Interaction {
  selectedSlotId?: string;
  focusedSlotId?: string;
  selectedOrderId?: string | null;
  selectTarget?: (target: DropTarget) => void;
  mode: "drag" | "resize" | null;
  target: DropTarget | null;
  preview: PlanningProposal | null;
  resizing: boolean;
  beginResize: (slot: PlanningSlot, event: PointerEvent<HTMLElement>) => void;
  resizeKey: (slot: PlanningSlot, event: KeyboardEvent<HTMLElement>) => void;
}
export const PlannerInteractionContext = createContext<Interaction | null>(null);
export function usePlannerInteraction() {
  const value = useContext(PlannerInteractionContext);
  if (!value) throw new Error("Plannerinteractie ontbreekt.");
  return value;
}
function interactive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button,a,input,select,textarea,[data-resize-edge]"));
}
export function useWholeCardDrag(id: string, data: DragSource, open: () => void, disabled = false) {
  const drag = useDraggable({ id, data, disabled, attributes: { roleDescription: "verplaatsbare werkorder" } });
  const moved = useRef(false);
  const origin = useRef<Point | null>(null);
  useEffect(() => { if (drag.isDragging) moved.current = true; }, [drag.isDragging]);
  return {
    ...drag,
    cardProps: {
      ...drag.attributes,
      onPointerDownCapture: (event: PointerEvent<HTMLElement>) => { moved.current = false; origin.current = { x: event.clientX, y: event.clientY }; },
      onPointerMoveCapture: (event: PointerEvent<HTMLElement>) => { if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 6) moved.current = true; },
      onPointerDown: (event: PointerEvent<HTMLElement>) => { if (!interactive(event.target) && event.pointerType !== "touch") drag.listeners?.onPointerDown?.(event); },
      onTouchStart: (event: React.TouchEvent<HTMLElement>) => { if (!interactive(event.target)) drag.listeners?.onTouchStart?.(event); },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (interactive(event.target)) return;
        if (event.code === "Enter" && !drag.isDragging) { event.preventDefault(); open(); return; }
        drag.listeners?.onKeyDown?.(event);
      },
      onClick: (event: React.MouseEvent<HTMLElement>) => { if (!interactive(event.target) && !moved.current && !drag.isDragging) open(); },
    },
  };
}
interface ResizeTransaction {
  slot: PlanningSlot; pointerId: number; startY: number; lastY: number; end: number;
  scrollElement: Element; startScroll: number; moved: boolean; edge: HTMLElement;
}
export function useBookingResize(timelineHeight: number, anchorRef: RefObject<Point>) {
  const { dispatch } = useApp();
  const [draft, setDraft] = useState<ResizeDraft | null>(null);
  const transaction = useRef<ResizeTransaction | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerSlotId = draft?.kind === "pointer" ? draft.slotId : null;

  function reset() {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    const current = transaction.current;
    if (current?.edge.hasPointerCapture(current.pointerId)) current.edge.releasePointerCapture(current.pointerId);
    transaction.current = null;
    setDraft(null);
  }
  function beginResize(slot: PlanningSlot, event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation();
    if (clearTimer.current) clearTimeout(clearTimer.current);
    const edge = event.currentTarget;
    edge.setPointerCapture(event.pointerId);
    const scrollElement = edge.closest("[data-planner-scroll]") ?? document.scrollingElement ?? document.documentElement;
    transaction.current = { slot, pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, end: slot.end, scrollElement, startScroll: scrollElement.scrollTop, moved: false, edge };
    anchorRef.current = { x: event.clientX, y: event.clientY };
    setDraft({ slotId: slot.id, end: slot.end, kind: "pointer" });
  }
  function resizeKey(slot: PlanningSlot, event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Escape") { reset(); return; }
    const end = event.key === "Home" ? (Math.floor(slot.start / SLOT_STEP) + 1) * SLOT_STEP : event.key === "End" ? WINDOW_END : (event.key === "ArrowUp" ? Math.ceil(slot.end / SLOT_STEP) - 1 : Math.floor(slot.end / SLOT_STEP) + 1) * SLOT_STEP;
    const bounds = event.currentTarget.getBoundingClientRect();
    anchorRef.current = { x: bounds.right, y: bounds.bottom };
    setDraft({ slotId: slot.id, end, kind: "keyboard" });
    dispatch({ type: "resize", slotId: slot.id, end });
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setDraft(null), 1800);
  }

  useEffect(() => {
    if (!pointerSlotId) return;
    const current = transaction.current;
    if (!current) return;
    function update(event?: globalThis.PointerEvent) {
      if (event && event.pointerId !== current!.pointerId) return;
      if (event) { current!.lastY = event.clientY; anchorRef.current = { x: event.clientX, y: event.clientY }; }
      const delta = current!.lastY - current!.startY + current!.scrollElement.scrollTop - current!.startScroll;
      if (Math.abs(delta) >= 3) current!.moved = true;
      if (!current!.moved) return;
      current!.end = Math.max(0, Math.min(1440, snapTime(current!.slot.end + delta * (WINDOW_END - WINDOW_START) / timelineHeight)));
      setDraft(previous => previous?.end === current!.end ? previous : { slotId: current!.slot.id, end: current!.end, kind: "pointer" });
      event?.preventDefault();
    }
    function finish() {
      if (current!.edge.hasPointerCapture(current!.pointerId)) current!.edge.releasePointerCapture(current!.pointerId);
      transaction.current = null; setDraft(null);
    }
    function end(event: globalThis.PointerEvent) {
      if (event.pointerId !== current!.pointerId) return;
      update(event);
      if (current!.moved && current!.end !== current!.slot.end) dispatch({ type: "resize", slotId: current!.slot.id, end: current!.end });
      finish();
    }
    function cancel(event: globalThis.PointerEvent) { if (event.pointerId === current!.pointerId) finish(); }
    function key(event: globalThis.KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); finish(); } }
    const scroll = () => update();
    window.addEventListener("pointermove", update, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("pointermove", update); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key); window.removeEventListener("scroll", scroll, true);
      if (current.edge.hasPointerCapture(current.pointerId)) current.edge.releasePointerCapture(current.pointerId);
    };
  }, [pointerSlotId, timelineHeight, anchorRef, dispatch]);
  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);
  return { draft, beginResize, resizeKey, reset };
}

export function FloatingFeedback({ anchorRef, label, error, announce = false }: { anchorRef: RefObject<Point>; label: string; error: string | null; announce?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    function position() {
      const node = ref.current;
      if (node) {
        const x = Math.max(8, Math.min(innerWidth - node.offsetWidth - 8, anchorRef.current.x + 14));
        const y = Math.max(8, Math.min(innerHeight - node.offsetHeight - 8, anchorRef.current.y + 18));
        node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      frame = requestAnimationFrame(position);
    }
    position();
    return () => cancelAnimationFrame(frame);
  }, [anchorRef]);
  return createPortal(<div ref={ref} data-planner-feedback data-invalid={Boolean(error)} role={announce ? "status" : undefined} aria-hidden={!announce} className={`pointer-events-none fixed left-0 top-0 z-50 max-w-[min(360px,calc(100vw-16px))] rounded-lg border bg-white px-3 py-2 shadow-lg ${error ? "border-rose-300" : "border-teal-300"}`}><p className="text-[11px] font-medium leading-5 text-slate-700">{label}</p>{error && <p className="text-[10px] leading-4 text-rose-600">{error}</p>}</div>, document.body);
}
