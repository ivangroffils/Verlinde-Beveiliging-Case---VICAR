"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DragMoveEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, Inbox, Keyboard, MapPin, Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, inputClass, StatusBadge } from "./ui";
import { calendarDate, customerName, DEFAULT_DURATION, formatDate, formatTime, maintenanceStatus, overlaps, parseTime, snapTime, proposePlanning, proposeResize, WINDOW_START, WINDOW_END, SLOT_STEP } from "@/lib/domain/rules";
import type { PlannerMode } from "@/lib/domain/planning";
import type { Appointment, PlanningSlot, Resource, WorkOrder } from "@/types/domain";

import { FloatingFeedback, PlannerInteractionContext, useBookingResize, usePlannerInteraction, useWholeCardDrag, type DragSource, type DropTarget, type Point } from "./planner-interactions";
type DragData = DragSource;
type DropData = DropTarget;
const mobileQuery = "(max-width: 767px)";
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function useIsMobile() { return useSyncExternalStore(subscribeMobile, () => window.matchMedia(mobileQuery).matches, () => false); }
const LANE_HEIGHT = 284;
const TIMELINE_HEIGHT = 260;
const LANE_PADDING = 12;
const times = Array.from({ length: (WINDOW_END - WINDOW_START) / SLOT_STEP }, (_, index) => WINDOW_START + index * SLOT_STEP);
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return undefined;
  event.preventDefault();
  const targets = context.droppableContainers.getEnabled().flatMap(container => {
    const rect = context.droppableRects.get(container.id);
    return rect ? [{ id: container.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height }] : [];
  });
  const origin = targets.find(target => target.id === context.over?.id);
  const width = context.collisionRect?.width ?? 0;
  const height = context.collisionRect?.height ?? 0;
  const center = { x: currentCoordinates.x + width / 2, y: currentCoordinates.y + height / 2 };
  const inside = targets.some(target => Math.abs(center.x - target.x) <= target.width / 2 && Math.abs(center.y - target.y) <= target.height / 2);
  if (!origin || !inside) { const first = targets[0]; return first ? { x: first.x - (context.collisionRect?.width ?? 0) / 2, y: first.y - (context.collisionRect?.height ?? 0) / 2 } : currentCoordinates; }
  const horizontal = event.code === "ArrowLeft" || event.code === "ArrowRight";
  const direction = event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 1;
  const candidates = targets.filter(target => target.id !== origin.id && (horizontal ? (target.x - origin.x) * direction > 2 : (target.y - origin.y) * direction > 2));
  candidates.sort((a, b) => {
    const score = (target: typeof a) => horizontal ? Math.abs(target.x - origin.x) + Math.abs(target.y - origin.y) * 100 : Math.abs(target.y - origin.y) + Math.abs(target.x - origin.x) * 100;
    return score(a) - score(b);
  });
  const target = candidates[0];
  return target ? { x: target.x - width / 2, y: target.y - height / 2 } : currentCoordinates;
};
function WorkOrderCard({ order }: { order: WorkOrder }) {
  const { state, relations, openOrder } = useApp();
  const interaction = usePlannerInteraction();
  const selected = interaction.selectedOrderId === order.id;
  const cardRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (selected) { cardRef.current?.scrollIntoView({ block: "nearest" }); cardRef.current?.focus({ preventScroll: true }); } }, [selected]);
  const { cardProps, setNodeRef, isDragging } = useWholeCardDrag(`backlog-${order.id}`, { workOrderId: order.id }, () => openOrder(order.id), interaction.resizing);
  const sheet = relations.getManagementSheetForWorkOrder(order.id);
  const urgency = sheet ? maintenanceStatus(sheet, state.today) : null;
  return <article ref={node => { setNodeRef(node); cardRef.current = node; }} {...cardProps} data-selected={selected} data-backlog-order={order.id} aria-label={`Werkorder ${order.id}, ${customerName(state, order.customerId)}`} className={`group touch-manipulation select-none cursor-grab rounded-lg border border-slate-200 bg-white p-3 transition-[border-color,box-shadow,opacity] hover:border-teal-300 hover:shadow-sm active:cursor-grabbing ${selected ? "ring-2 ring-teal-500" : ""} ${isDragging ? "opacity-30 ring-1 ring-teal-400" : ""}`}>
    <p className="text-[13px] font-semibold leading-5 text-slate-800">{customerName(state, order.customerId)}</p><p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{order.id}</p>
    <p className="mt-1 truncate text-[11px] text-slate-500" title={order.installation}>{order.installation === "Installatie ontbreekt" ? order.description : order.installation}</p>
    <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><MapPin size={11} className="shrink-0" /><span className="truncate" title={order.site}>{order.site === "Locatie ontbreekt" ? "—" : order.site}</span></p>
    <div className="mt-2 flex items-center gap-2">{urgency === "overdue" || urgency === "upcoming" ? <StatusBadge status={urgency} /> : <span className="text-[10px] text-slate-400">{order.kind}</span>}{order.hasInvalidPlanning && <AlertTriangle size={12} className="text-amber-500" aria-label="Planning controleren" />}<span className="ml-auto flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-400"><Clock3 size={10} />2 u</span></div>
  </article>;
}
function ManualPlanning({ initialOrderId, expand, onScheduled }: { initialOrderId: string | null; expand: boolean; onScheduled: () => void }) {
  const { state, relations, dispatch, planning } = useApp();
  const active = planning.schedulableOrders;
  const initialOrder = active.find(order => order.id === initialOrderId) ?? active[0];
  const initialSlot = initialOrderId ? relations.getAppointmentsForWorkOrder(initialOrderId).at(-1) : null;
  const [orderId, setOrderId] = useState(initialOrder?.id ?? "");
  const [resourceId, setResourceId] = useState(initialSlot?.resourceId ?? state.resources[0]?.id ?? "");
  const [date, setDate] = useState(state.today);
  const [start, setStart] = useState("08:00");
  const [slotId, setSlotId] = useState(initialSlot?.id ?? "");
  const prefix = useId();
  const effectiveOrderId = active.some(order => order.id === orderId) ? orderId : active[0]?.id ?? "";
  const orderSlots = relations.getAppointmentsForWorkOrder(effectiveOrderId);
  function selectSlot(id: string) {
    const slot = state.slots.find(item => item.id === id);
    setSlotId(id);
    if (slot) { setResourceId(slot.resourceId); setDate(slot.date); setStart(formatTime(slot.start)); }
  }
  function selectOrder(id: string) {
    setOrderId(id);
    const slot = relations.getAppointmentsForWorkOrder(id)[0];
    selectSlot(slot?.id ?? "");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { workOrderId: effectiveOrderId, resourceId, date, start: parseTime(start) ?? -1, slotId: slotId || orderSlots[0]?.id };
    const proposal = proposePlanning(state, input);
    dispatch({ type: "schedule", ...input });
    if (!proposal.error) onScheduled();
  }
  const selectedSlot = orderSlots.find(item => item.id === slotId) ?? orderSlots[0];
  const duration = selectedSlot ? selectedSlot.end - selectedSlot.start : DEFAULT_DURATION;
  return <details open={expand && active.some(order => order.id === initialOrderId) ? true : undefined} data-selected-order={initialOrderId ?? undefined} className="border-t border-slate-200 bg-white p-3"><summary className="cursor-pointer text-xs font-medium text-slate-500"><Keyboard size={15} className="mr-2 inline" />Afspraak plannen</summary><form onSubmit={submit} className="mt-4 space-y-3 text-xs"><label htmlFor={`${prefix}-order`} className="block font-medium">Werkorder</label><select id={`${prefix}-order`} value={effectiveOrderId} onChange={event => selectOrder(event.target.value)} className={`${inputClass} w-full`}>{!active.length && <option value="">Geen actieve werkorders</option>}{active.map(order => <option key={order.id} value={order.id}>{order.id} · {customerName(state, order.customerId)}</option>)}</select>
    {orderSlots.length > 1 && <label className="block">Afspraak<select className={`${inputClass} mt-1 w-full`} value={slotId || orderSlots[0]?.id} onChange={event => selectSlot(event.target.value)}>{orderSlots.map(slot => <option key={slot.id} value={slot.id}>{formatDate(slot.date)} · {formatTime(slot.start)}</option>)}</select></label>}
    <label className="block font-medium">Resource<select value={resourceId} onChange={event => setResourceId(event.target.value)} className={`${inputClass} mt-1 w-full`} required>{state.resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="font-medium">Datum<input type="date" required value={date} onChange={event => setDate(event.target.value)} className={`${inputClass} mt-1 w-full min-w-0`} /></label><label className="font-medium">Starttijd<select value={start} onChange={event => setStart(event.target.value)} className={`${inputClass} mt-1 w-full`}>{times.map(time => <option key={time} value={formatTime(time)}>{formatTime(time)}</option>)}</select></label></div><p className="text-slate-500">Duur: {duration / 60} uur</p><Button className="w-full" type="submit" disabled={!effectiveOrderId || !resourceId}>{orderSlots.length ? "Verplaatsen" : "Inplannen"}</Button></form></details>;
}
function PlanningBacklog({ selectedOrderId, placing, onScheduled }: { selectedOrderId: string | null; placing: boolean; onScheduled: () => void }) {
  const { state, planning } = useApp();
  const [query, setQuery] = useState("");
  const backlog = planning.backlog;
  const matching = backlog.filter(order => `${order.id} ${customerName(state, order.customerId)} ${order.installation} ${order.site}`.toLowerCase().includes(query.toLowerCase()));
  return <aside aria-label="Ongeplande werkorders" className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:w-56 xl:w-60">
    <div className="border-b border-slate-100 p-3"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Inbox size={16} className="text-slate-400" />Te plannen</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">{backlog.length}</span></div><label className="relative mt-3 block"><span className="sr-only">Zoek in backlog</span><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek werkorder…" className={`${inputClass} w-full pl-9`} /></label></div>
    <div className="max-h-64 flex-1 space-y-2 overflow-y-auto bg-slate-50/50 p-2 md:max-h-[calc(100dvh-20rem)]">{matching.map(order => <WorkOrderCard key={order.id} order={order} />)}{!matching.length && <p className="py-8 text-center text-xs text-slate-400">{backlog.length ? "Geen werkorders gevonden." : "Alles ingepland."}</p>}</div>
    {backlog.length > matching.length && <p className="px-3 py-2 text-[10px] text-slate-400">{matching.length} van {backlog.length}</p>}<ManualPlanning key={selectedOrderId ?? "default"} initialOrderId={selectedOrderId} expand={placing} onScheduled={onScheduled} />
  </aside>;
}
function TimeTarget({ resource, date, time }: { resource: Resource; date: string; time: number }) {
  const interaction = usePlannerInteraction();
  const { state } = useApp();
  const clickTarget = { resourceId: resource.id, date, start: time };
  const { setNodeRef, isOver } = useDroppable({ id: `target-${resource.id}-${date}-${time}`, data: clickTarget satisfies DropData });
  const selectable = interaction.plannerMode === "place" && Boolean(interaction.selectedOrderId) && !interaction.mode;
  const selected = (interaction.mode === "drag" || selectable) && interaction.target?.resourceId === resource.id && interaction.target.date === date && interaction.target.start === time;
  const candidate = selectable ? proposePlanning(state, { workOrderId: interaction.selectedOrderId!, ...clickTarget, slotId: interaction.selectedSlotId }) : null;
  const invalid = selected && Boolean(interaction.preview?.error);
  const hover = (event: React.PointerEvent<HTMLElement>) => {
    if (selectable && event.pointerType !== "touch") interaction.previewTarget(clickTarget, { x: event.clientX, y: event.clientY });
  };
  return <div ref={setNodeRef} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined}
    aria-label={selectable ? `${resource.name}, ${formatDate(date)}, ${formatTime(time)}–${candidate?.slot ? formatTime(candidate.slot.end) : "onbekend"}. ${candidate?.error ?? "Beschikbaar"}` : undefined}
    onPointerEnter={hover} onPointerMove={hover} onPointerLeave={selectable ? () => interaction.previewTarget(null) : undefined}
    onFocus={selectable ? () => { if (!selected) interaction.previewTarget(clickTarget); } : undefined} onBlur={selectable ? () => interaction.previewTarget(null) : undefined}
    onClick={selectable ? () => interaction.selectTarget?.(clickTarget) : undefined}
    onKeyDown={selectable ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); interaction.selectTarget?.(clickTarget); } } : undefined}
    data-click-target={selectable} data-drop-target={`${resource.id}-${date}-${time}`} data-over={selected || (isOver && interaction.mode === "drag")} data-invalid={invalid} title={interaction.mode || selectable ? undefined : `${resource.name} · ${formatDate(date)} · ${formatTime(time)}`} className={`border-t ${selectable ? candidate?.error ? "cursor-not-allowed hover:bg-rose-100 focus-visible:bg-rose-100" : "cursor-pointer hover:bg-teal-100 focus-visible:bg-teal-100" : ""} ${time % 60 === 0 ? "border-slate-200/65" : "border-dashed border-slate-100"} ${selected ? invalid ? "bg-rose-100 ring-1 ring-inset ring-rose-400" : "bg-teal-200/70 ring-1 ring-inset ring-teal-500" : ""}`} />;
}
function PlannedBlock({ slot, column, columns, conflict }: { slot: PlanningSlot; column: number; columns: number; conflict: boolean }) {
  const { state, relations, openOrder, planning } = useApp();
  const interaction = usePlannerInteraction();
  const order = relations.workOrdersById.get(slot.workOrderId)!;
  const kind = planning.getAppointmentKind(order.id);
  const readOnly = kind !== "active";
  const { cardProps, setNodeRef, isDragging } = useWholeCardDrag(slot.id, { workOrderId: slot.workOrderId, slotId: slot.id }, () => openOrder(order.id), interaction.resizing || readOnly);
  const resizing = interaction.mode === "resize" && interaction.preview?.slot?.id === slot.id;
  const end = resizing ? interaction.preview!.slot!.end : slot.end;
  const invalid = resizing && Boolean(interaction.preview?.error);
  const visibleStart = Math.max(WINDOW_START, Math.min(slot.start, WINDOW_END - SLOT_STEP));
  const top = LANE_PADDING + (visibleStart - WINDOW_START) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT;
  const height = Math.max(20, (Math.min(end, WINDOW_END) - visibleStart) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT);
  const outside = slot.start < WINDOW_START || slot.end > WINDOW_END;
  return <div ref={setNodeRef} {...(readOnly ? { role: "button", tabIndex: 0, onClick: () => openOrder(order.id), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOrder(order.id); } } } : cardProps)} data-appointment-kind={kind} data-planning-slot={slot.id} data-work-order={slot.workOrderId} data-start={slot.start} data-end={slot.end} data-preview-end={end} aria-label={`${readOnly ? "Bekijk" : "Verplaats"} ${order.id}, ${formatDate(slot.date)}, ${formatTime(slot.start)}`} title={`${customerName(state, order.customerId)} · ${order.id} · ${formatDate(slot.date)} · ${formatTime(slot.start)}–${formatTime(end)}${conflict ? " · Overlap" : outside ? " · Buiten werktijd" : ""}`} style={{ top, height, left: `calc(${column / columns * 100}% + 3px)`, width: `calc(${100 / columns}% - 6px)` }} className={`group absolute ${readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} z-10 touch-manipulation select-none overflow-hidden rounded-md border px-1.5 py-0.5 shadow-xs transition-[box-shadow,opacity] hover:z-20 hover:shadow-md ${interaction.selectedOrderId === order.id || interaction.focusedSlotId === slot.id ? "ring-2 ring-teal-500" : ""} ${isDragging ? "opacity-25" : ""} ${kind === "history" ? "border-slate-200 bg-slate-100 text-slate-500" : kind === "executed" ? "border-sky-200 bg-sky-50 text-sky-900" : invalid ? "border-rose-400 bg-rose-50 text-rose-950 ring-1 ring-rose-300" : resizing ? "border-teal-500 bg-teal-50 text-teal-950 ring-1 ring-teal-400" : conflict || outside ? "border-amber-300 bg-amber-50 text-amber-950" : "border-teal-200 bg-teal-50 text-teal-950"}`}>
    <p className="truncate text-[11px] font-semibold leading-3">{(conflict || outside) && <AlertTriangle size={9} className="mr-0.5 inline" />}{customerName(state, order.customerId)}</p>
    {kind !== "active" && height >= 48 && <span className="text-[9px]">{kind === "history" ? "Afgewerkt" : "Uitgevoerd"}</span>}
    {height >= 26 && <p className="mt-0.5 truncate text-[9px] leading-[10px] opacity-65">{order.id}</p>}
    {height >= 48 && <p className="mt-1 truncate text-[9px] leading-[10px] tabular-nums opacity-50">{formatTime(slot.start)}–{formatTime(end)}</p>}
    {!readOnly && <div data-resize-edge role="separator" tabIndex={0} aria-orientation="horizontal" aria-label={`Eindtijd van ${order.id} aanpassen`} aria-valuenow={slot.end} aria-valuemin={slot.start + SLOT_STEP} aria-valuemax={WINDOW_END} aria-valuetext={`Eindtijd ${formatTime(slot.end)}. Gebruik pijl omhoog of omlaag.`} onPointerDown={event => interaction.beginResize(slot, event)} onKeyDown={event => interaction.resizeKey(slot, event)} className="absolute inset-x-0 bottom-0 z-20 h-2 touch-none cursor-ns-resize rounded-b-md hover:bg-current/10 focus-visible:bg-current/10" />}
  </div>;
}
function PlannerLane({ resource, date, slots }: { resource: Resource; date: string; slots: PlanningSlot[] }) {
  const interaction = usePlannerInteraction();
  const levels: PlanningSlot[][] = [];
  const placed = [...slots].sort((a, b) => a.start - b.start).map(slot => {
    let column = levels.findIndex(items => items.every(other => !overlaps(slot, other)));
    if (column < 0) { column = levels.length; levels.push([]); }
    levels[column].push(slot);
    return { slot, column };
  });
  const preview = interaction.preview?.slot;
  const showPreview = (interaction.mode === "drag" || interaction.plannerMode === "place" && !interaction.mode) && preview?.resourceId === resource.id && preview.date === date;
  const previewStart = preview ? Math.min(WINDOW_END - SLOT_STEP, Math.max(WINDOW_START, preview.start)) : WINDOW_START;
  const previewHeight = preview ? Math.max(13, (Math.min(WINDOW_END, preview.end) - previewStart) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT) : 0;
  return <div data-resource-id={resource.id} data-date={date} className="relative border-r border-b border-slate-200 bg-white" style={{ height: LANE_HEIGHT }}>
    <div className="absolute inset-x-0 grid grid-rows-20" style={{ top: LANE_PADDING, height: TIMELINE_HEIGHT }}>{times.map(time => <TimeTarget key={time} resource={resource} date={date} time={time} />)}</div>
    {placed.map(({ slot, column }) => <PlannedBlock key={slot.id} slot={slot} column={column} columns={levels.length} conflict={slots.some(other => overlaps(slot, other))} />)}
    {showPreview && <div data-drop-preview data-invalid={Boolean(interaction.preview?.error)} className={`pointer-events-none absolute inset-x-0.5 z-20 rounded-md border-2 border-dashed ${interaction.preview?.error ? "border-rose-400 bg-rose-100/40" : "border-teal-500 bg-teal-100/40"}`} style={{ top: LANE_PADDING + (previewStart - WINDOW_START) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT, height: previewHeight }} />}
  </div>;
}
function ResourceLabel({ resource }: { resource: Resource }) {
  const interaction = usePlannerInteraction();
  const active = interaction.preview?.slot?.resourceId === resource.id;
  return <div className={`sticky left-0 z-20 flex items-center border-r border-b border-slate-200 pl-3 pr-10 ${active ? interaction.preview?.error ? "bg-rose-50" : "bg-teal-50" : "bg-white"}`} style={{ height: LANE_HEIGHT }}>
    <p className="text-xs font-semibold leading-5 text-slate-600">{resource.name}</p>
    {[480, 600, 720, 840, 960, 1080].map(time => <span key={time} className="absolute right-1.5 font-mono text-[9px] tabular-nums text-slate-400" style={{ top: LANE_PADDING + (time - WINDOW_START) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT - 5 }}>{formatTime(time)}</span>)}
  </div>;
}
function WeekPlanner({ focusAppointment }: { focusAppointment: Appointment | null }) {
  const interaction = usePlannerInteraction();
  const isMobile = useIsMobile();
  const { state, planning } = useApp();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(calendarDate(focusAppointment?.date ?? state.today), { weekStartsOn: 1 }));
  const [selectedDay, setSelectedDay] = useState((calendarDate(focusAppointment?.date ?? state.today).getDay() + 6) % 7);
  useEffect(() => {
    if (!focusAppointment) return;
    const node = document.querySelector<HTMLElement>(`[data-planning-slot="${CSS.escape(focusAppointment.id)}"]`);
    node?.scrollIntoView({ block: "nearest", inline: "nearest" }); node?.focus({ preventScroll: true });
  }, [focusAppointment, isMobile]);
  const days = Array.from({ length: 7 }, (_, index) => format(addDays(weekStart, index), "yyyy-MM-dd"));
  const slots = planning.appointments.filter(slot => days.includes(slot.date));
  const gridClass = "grid grid-cols-[140px_repeat(7,minmax(0,1fr))]";
  return <section aria-label="Weekplanner" onPointerLeave={() => interaction.previewTarget(null)} onScrollCapture={() => interaction.previewTarget(null)} className="w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} className="text-slate-400" />Week {format(weekStart, "II")}<span className="text-xs font-normal text-slate-400">{formatDate(days[0])} – {formatDate(days[6])}</span></h2></div><div className="flex items-center gap-1"><Button variant="quiet" className="min-h-8 px-2" aria-label="Vorige week" onClick={() => setWeekStart(value => addWeeks(value, -1))}><ChevronLeft size={17} /></Button><Button variant="secondary" className="min-h-8 text-xs" onClick={() => { setWeekStart(startOfWeek(calendarDate(state.today), { weekStartsOn: 1 })); setSelectedDay((calendarDate(state.today).getDay() + 6) % 7); }}>Vandaag</Button><Button variant="quiet" className="min-h-8 px-2" aria-label="Volgende week" onClick={() => setWeekStart(value => addWeeks(value, 1))}><ChevronRight size={17} /></Button></div></div>
    {!isMobile ? <div data-planner-scroll className="max-h-[calc(100dvh-16rem)] min-h-80 overflow-auto"><div className="min-w-[900px]">
      <div className={`${gridClass} sticky top-0 z-30 bg-slate-50`}><div className="sticky left-0 z-40 flex items-center border-r border-b border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-400">Resource</div>{days.map(date => <div key={date} className={`border-r border-b border-slate-200 px-2 py-3 ${date === state.today || date === interaction.target?.date ? "bg-teal-50" : "bg-slate-50"}`}><p className={`text-xs font-medium ${date === state.today ? "text-teal-800" : "text-slate-500"}`}><span className={`inline-flex min-h-6 items-center justify-center rounded-md px-1.5 ${date === state.today ? "bg-teal-700 text-white" : "text-slate-700"}`}>{formatDate(date, "calendar")}</span></p></div>)}</div>
      {state.resources.map(resource => <div key={resource.id} className={gridClass}><ResourceLabel resource={resource} />{days.map(date => <PlannerLane key={date} resource={resource} date={date} slots={slots.filter(slot => slot.resourceId === resource.id && slot.date === date)} />)}</div>)}
    </div></div> : <div><div className="grid grid-cols-7 border-b border-slate-200">{days.map((date, index) => <button key={date} aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)} className={`py-2.5 text-center text-xs ${selectedDay === index ? "bg-teal-700 font-medium text-white" : "text-slate-400 hover:bg-slate-50"}`}><span className="block px-1 leading-5">{formatDate(date, "calendar")}</span></button>)}</div>{state.resources.map(resource => <div key={resource.id}><h3 className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">{resource.name}</h3><div className="grid grid-cols-[44px_minmax(0,1fr)]"><div className="relative border-b border-r border-slate-200" style={{ height: LANE_HEIGHT }}>{[480, 600, 720, 840, 960, 1080].map(time => <span key={time} className="absolute right-1 font-mono text-[9px] text-slate-400" style={{ top: LANE_PADDING + (time - WINDOW_START) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT - 5 }}>{formatTime(time)}</span>)}</div><PlannerLane resource={resource} date={days[selectedDay]} slots={slots.filter(slot => slot.resourceId === resource.id && slot.date === days[selectedDay])} /></div></div>)}</div>}
    {!state.resources.length && <p className="p-8 text-center text-sm text-slate-400">Geen resources beschikbaar.</p>}
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-[10px] text-slate-400"><span>{slots.length} afspraken</span><span className="flex items-center gap-3"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-teal-400" />Ingepland</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-400" />Overlap</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-slate-300" />Historie</span></span></div>
  </section>;
}
export function PlanningOverview({ workOrderId = null, plannerMode = "view" }: { workOrderId?: string | null; plannerMode?: PlannerMode }) {
  const { state, relations, dispatch, planning, openOrder } = useApp();
  const [navigation] = useState(() => planning.getSelection(workOrderId));
  const [consumed, setConsumed] = useState(false);
  const selection = planning.getSelection(workOrderId);
  const selectedOrderId = !consumed && selection.canSchedule ? selection.order!.id : null;
  const isPlacing = plannerMode === "place" && Boolean(selectedOrderId);
  const activePlannerMode: PlannerMode = isPlacing ? "place" : "view";
  const [placementTarget, setPlacementTarget] = useState<DropData | null>(null);
  const [pointerPreview, setPointerPreview] = useState(false);
  function selectTarget(destination: DropData) {
    if (!isPlacing || !selectedOrderId) return;
    const input = { workOrderId: selectedOrderId, slotId: selection.slotId, ...destination };
    const proposal = proposePlanning(state, input);
    dispatch({ type: "schedule", ...input });
    if (!proposal.error) setConsumed(true);
  }
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [target, setTarget] = useState<DropData | null>(null);
  const anchor = useRef<Point>({ x: 0, y: 0 });
  const grabOffset = useRef(0);
  const resize = useBookingResize(TIMELINE_HEIGHT, anchor);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  const mode = resize.draft ? "resize" as const : dragging ? "drag" as const : null;
  const preview = resize.draft ? proposeResize(state, resize.draft.slotId, resize.draft.end)
    : dragging && target ? proposePlanning(state, { ...dragging, ...target })
    : isPlacing && placementTarget ? proposePlanning(state, { workOrderId: selectedOrderId!, slotId: selection.slotId, ...placementTarget }) : null;
  const interactionTarget = dragging ? target : isPlacing ? placementTarget : null;
  function previewTarget(next: DropData | null, point?: Point) {
    if (point) anchor.current = point;
    setPointerPreview(Boolean(next && point));
    setPlacementTarget(previous => previous?.resourceId === next?.resourceId && previous?.date === next?.date && previous?.start === next?.start ? previous : next);
  }
  function cancelPlacement() { setConsumed(true); previewTarget(null); }
  useEffect(() => {
    if (!isPlacing || mode) return;
    const cancel = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setConsumed(true); setPlacementTarget(null); setPointerPreview(false); } };
    const hide = () => { setPlacementTarget(null); setPointerPreview(false); };
    window.addEventListener("keydown", cancel); window.addEventListener("blur", hide);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", hide); };
  }, [isPlacing, mode]);
  const slot = preview?.slot;
  const resource = relations.resourcesByCode.get(slot?.resourceId ?? "")?.name ?? "";
  const label = mode === "resize" ? `Eindtijd ${formatTime(resize.draft!.end)}` : slot ? `${formatDate(slot.date, "calendar")} · ${resource} · ${formatTime(slot.start)}–${formatTime(slot.end)}` : "Kies een tijdvak";

  useEffect(() => {
    if (!dragging) return;
    const pointer = (event: globalThis.PointerEvent) => { anchor.current = { x: event.clientX, y: event.clientY }; };
    const touch = (event: globalThis.TouchEvent) => { const point = event.touches[0]; if (point) anchor.current = { x: point.clientX, y: point.clientY }; };
    window.addEventListener("pointermove", pointer); window.addEventListener("touchmove", touch, { passive: true });
    return () => { window.removeEventListener("pointermove", pointer); window.removeEventListener("touchmove", touch); };
  }, [dragging]);
  function dragStart(event: DragStartEvent) {
    resize.reset(); previewTarget(null);
    const source = event.active.data.current as DragData;
    setDragging(source); setTarget(null);
    grabOffset.current = 0;
    const native = event.activatorEvent;
    if ("clientX" in native && "clientY" in native) anchor.current = { x: Number(native.clientX), y: Number(native.clientY) };
    else if ("touches" in native) { const point = (native as TouchEvent).touches[0]; if (point) anchor.current = { x: point.clientX, y: point.clientY }; }
    if (native.type.startsWith("key") && document.activeElement instanceof HTMLElement) { const rect = document.activeElement.getBoundingClientRect(); anchor.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
    const existing = source.slotId ? state.slots.find(item => item.id === source.slotId) : undefined;
    if (existing && !native.type.startsWith("key")) {
      const node = document.querySelector<HTMLElement>(`[data-planning-slot="${CSS.escape(existing.id)}"]`);
      const top = node?.getBoundingClientRect().top ?? event.active.rect.current.initial?.top ?? anchor.current.y;
      const offset = snapTime((anchor.current.y - top) * (WINDOW_END - WINDOW_START) / TIMELINE_HEIGHT);
      grabOffset.current = Math.max(0, Math.min(existing.end - existing.start - SLOT_STEP, offset));
      grabOffset.current = Math.floor(grabOffset.current / SLOT_STEP) * SLOT_STEP;
    }
  }
  function destinationAt(value: DropData | undefined): DropData | null {
    return value ? { ...value, start: value.start - grabOffset.current } : null;
  }
  function dragMove(event: DragMoveEvent) {
    const next = destinationAt(event.over?.data.current as DropData | undefined);
    setTarget(previous => previous?.resourceId === next?.resourceId && previous?.date === next?.date && previous?.start === next?.start ? previous : next ?? null);
    if (event.activatorEvent.type.startsWith("key") && event.over) anchor.current = { x: event.over.rect.left + event.over.rect.width / 2, y: event.over.rect.top + event.over.rect.height / 2 };
  }
  function dragEnd(event: DragEndEvent) {
    const source = event.active.data.current as DragData | undefined;
    const destination = destinationAt(event.over?.data.current as DropData | undefined);
    setDragging(null); setTarget(null);
    if (source && destination) {
      const proposal = proposePlanning(state, { ...source, ...destination });
      dispatch({ type: "schedule", ...source, ...destination });
      if (!proposal.error && source.workOrderId === selectedOrderId) setConsumed(true);
    }
    else if (source) dispatch({ type: "error", message: "Geen geldig tijdvak gekozen." });
  }
  return <>
    <h1 className="mb-5 text-2xl font-semibold tracking-tight">Planning</h1>
    {workOrderId && !consumed && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><span>{selection.order?.id ?? workOrderId} · {selection.error ?? (isPlacing ? "Kies een tijdvak of sleep de werkorder" : "Afspraak bekijken")}</span>{isPlacing && <Button variant="quiet" className="min-h-8 text-xs" onClick={cancelPlacement}>Annuleren</Button>}{selection.order && <Button variant="quiet" className="min-h-8 text-xs" onClick={() => openOrder(selection.order!.id)}>Bekijken</Button>}</div>}
    <PlannerInteractionContext.Provider value={{ plannerMode: activePlannerMode, previewTarget, selectedSlotId: selection.slotId, focusedSlotId: navigation.focusAppointment?.id, selectedOrderId, selectTarget, mode, target: interactionTarget, preview, resizing: resize.draft?.kind === "pointer", beginResize: resize.beginResize, resizeKey: resize.resizeKey }}>
      <DndContext id="maintenance-planning" sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)} onDragStart={dragStart} onDragMove={dragMove} onDragOver={dragMove} onDragEnd={dragEnd} onDragCancel={() => { setDragging(null); setTarget(null); previewTarget(null); }} accessibility={{ screenReaderInstructions: { draggable: "Enter opent details. Spatie pakt de werkorder op. Pijltjestoetsen kiezen resource, dag en tijd. Spatie plaatst de werkorder; Escape annuleert. Op de onderrand wijzigen pijl omhoog en omlaag de eindtijd." }, announcements: { onDragStart: () => "Werkorder opgepakt.", onDragOver: ({ active, over }) => { const destination = destinationAt(over?.data.current as DropData | undefined); if (!destination) return "Buiten de planner."; const proposal = proposePlanning(state, { ...(active.data.current as DragData), ...destination }); return `${relations.resourcesByCode.get(destination.resourceId)?.name}, ${formatDate(destination.date)}, ${formatTime(destination.start)} tot ${proposal.slot ? formatTime(proposal.slot.end) : "onbekend"}. ${proposal.error ?? "Beschikbaar."}`; }, onDragEnd: () => "Sleepactie beëindigd.", onDragCancel: () => "Slepen geannuleerd." } }}>
        <div data-planner-mode={activePlannerMode} className="flex flex-col items-start gap-4 md:flex-row"><PlanningBacklog selectedOrderId={selectedOrderId} placing={isPlacing} onScheduled={() => setConsumed(true)} /><WeekPlanner focusAppointment={navigation.focusAppointment} /></div>
      </DndContext>
      {mode && <FloatingFeedback anchorRef={anchor} label={label} error={preview?.error ?? null} announce={mode === "resize"} />}
      {isPlacing && !mode && pointerPreview && placementTarget && slot && selection.order && <FloatingFeedback anchorRef={anchor} label={label} error={preview?.error ?? null}>
        <div className="w-60 max-w-full text-[11px] leading-4 text-slate-600">
          <p className="text-xs font-semibold text-slate-800">{customerName(state, selection.order.customerId)}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">{selection.order.id}</p>
          <p className="mt-2 line-clamp-2">{selection.order.installation === "Installatie ontbreekt" ? selection.order.description : selection.order.installation}</p>
          <p className="mt-2 font-medium">{resource}</p>
          <p className="mt-0.5 tabular-nums">{formatDate(slot.date)} · {formatTime(slot.start)}–{formatTime(slot.end)}</p>
          <p className="mt-1 text-[10px] text-slate-400">Duur: {new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format((slot.end - slot.start) / 60)} uur</p>
        </div>
      </FloatingFeedback>}
    </PlannerInteractionContext.Provider>
  </>;
}
