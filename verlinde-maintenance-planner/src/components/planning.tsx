"use client";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, GripVertical, Inbox, Keyboard, MapPin, Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, inputClass, StatusBadge } from "./ui";
import { activeSlots, calendarDate, customerName, DEFAULT_DURATION, formatDate, formatTime, maintenanceStatus, overlaps, parseTime, WINDOW_START, WINDOW_END, SLOT_STEP } from "@/lib/domain/rules";
import type { PlanningSlot, Resource, WorkOrder } from "@/types/domain";

type DragData = { workOrderId: string; slotId?: string };
type DropData = { resourceId: string; date: string; start: number };
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
  const { state, openOrder } = useApp();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `backlog-${order.id}`, data: { workOrderId: order.id } satisfies DragData });
  const sheet = state.sheets.find(item => order.sheetIds.includes(item.id));
  const urgency = sheet ? maintenanceStatus(sheet, state.today) : null;
  return <article ref={setNodeRef} className={`group rounded-lg border border-slate-200 bg-white p-3 transition-[border-color,box-shadow,opacity] hover:border-teal-300 hover:shadow-sm ${isDragging ? "opacity-30 ring-1 ring-teal-400" : ""}`}>
    <div className="flex items-start gap-1">
      <button onClick={() => openOrder(order.id)} className="min-w-0 flex-1 text-left"><p className="text-[13px] font-semibold leading-5 text-slate-800">{customerName(state, order.customerId)}</p><p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{order.id}</p></button>
      <button {...attributes} {...listeners} aria-label={`Sleep ${order.id} naar de planner`} className="-mr-1 flex size-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-slate-300 hover:bg-slate-50 hover:text-teal-700 active:cursor-grabbing"><GripVertical size={16} /></button>
    </div>
    <p className="mt-1 truncate text-[11px] text-slate-500" title={order.installation}>{order.installation === "Installatie ontbreekt" ? order.description : order.installation}</p>
    <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><MapPin size={11} className="shrink-0" /><span className="truncate" title={order.site}>{order.site === "Locatie ontbreekt" ? "—" : order.site}</span></p>
    <div className="mt-2 flex items-center gap-2">{urgency === "overdue" || urgency === "upcoming" ? <StatusBadge status={urgency} /> : <span className="text-[10px] text-slate-400">{order.kind}</span>}{order.hasInvalidPlanning && <AlertTriangle size={12} className="text-amber-500" aria-label="Planning controleren" />}<span className="ml-auto flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-400"><Clock3 size={10} />2 u</span></div>
  </article>;
}
function ManualPlanning() {
  const { state, dispatch } = useApp();
  const active = state.workOrders.filter(order => order.status !== "completed");
  const [orderId, setOrderId] = useState(active[0]?.id ?? "");
  const [resourceId, setResourceId] = useState(state.resources[0]?.id ?? "");
  const [date, setDate] = useState(state.today);
  const [start, setStart] = useState("08:00");
  const [slotId, setSlotId] = useState("");
  const prefix = useId();
  const effectiveOrderId = active.some(order => order.id === orderId) ? orderId : active[0]?.id ?? "";
  const orderSlots = state.slots.filter(slot => slot.workOrderId === effectiveOrderId);
  function selectSlot(id: string) {
    const slot = state.slots.find(item => item.id === id);
    setSlotId(id);
    if (slot) { setResourceId(slot.resourceId); setDate(slot.date); setStart(formatTime(slot.start)); }
  }
  function selectOrder(id: string) {
    setOrderId(id);
    const slot = state.slots.find(item => item.workOrderId === id);
    selectSlot(slot?.id ?? "");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "schedule", workOrderId: effectiveOrderId, resourceId, date, start: parseTime(start) ?? -1, slotId: slotId || orderSlots[0]?.id });
  }
  const selectedSlot = orderSlots.find(item => item.id === slotId) ?? orderSlots[0];
  const duration = selectedSlot ? selectedSlot.end - selectedSlot.start : DEFAULT_DURATION;
  return <details className="border-t border-slate-200 bg-white p-3"><summary className="cursor-pointer text-xs font-medium text-slate-500"><Keyboard size={15} className="mr-2 inline" />Afspraak plannen</summary><form onSubmit={submit} className="mt-4 space-y-3 text-xs"><label htmlFor={`${prefix}-order`} className="block font-medium">Werkorder</label><select id={`${prefix}-order`} value={effectiveOrderId} onChange={event => selectOrder(event.target.value)} className={`${inputClass} w-full`}>{!active.length && <option value="">Geen actieve werkorders</option>}{active.map(order => <option key={order.id} value={order.id}>{order.id} · {customerName(state, order.customerId)}</option>)}</select>
    {orderSlots.length > 1 && <label className="block">Afspraak<select className={`${inputClass} mt-1 w-full`} value={slotId || orderSlots[0]?.id} onChange={event => selectSlot(event.target.value)}>{orderSlots.map(slot => <option key={slot.id} value={slot.id}>{formatDate(slot.date)} · {formatTime(slot.start)}</option>)}</select></label>}
    <label className="block font-medium">Resource<select value={resourceId} onChange={event => setResourceId(event.target.value)} className={`${inputClass} mt-1 w-full`} required>{state.resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="font-medium">Datum<input type="date" required value={date} onChange={event => setDate(event.target.value)} className={`${inputClass} mt-1 w-full min-w-0`} /></label><label className="font-medium">Starttijd<select value={start} onChange={event => setStart(event.target.value)} className={`${inputClass} mt-1 w-full`}>{times.map(time => <option key={time} value={formatTime(time)}>{formatTime(time)}</option>)}</select></label></div><p className="text-slate-500">Duur: {duration / 60} uur</p><Button className="w-full" type="submit" disabled={!effectiveOrderId || !resourceId}>{orderSlots.length ? "Verplaatsen" : "Inplannen"}</Button></form></details>;
}
function PlanningBacklog() {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const backlog = state.workOrders.filter(order => order.status === "unplanned");
  const matching = backlog.filter(order => `${order.id} ${customerName(state, order.customerId)} ${order.installation} ${order.site}`.toLowerCase().includes(query.toLowerCase()));
  return <aside aria-label="Ongeplande werkorders" className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:w-56 xl:w-60">
    <div className="border-b border-slate-100 p-3"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Inbox size={16} className="text-slate-400" />Te plannen</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">{backlog.length}</span></div><label className="relative mt-3 block"><span className="sr-only">Zoek in backlog</span><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek werkorder…" className={`${inputClass} w-full pl-9`} /></label></div>
    <div className="max-h-64 flex-1 space-y-2 overflow-y-auto bg-slate-50/50 p-2 md:max-h-[calc(100dvh-20rem)]">{matching.map(order => <WorkOrderCard key={order.id} order={order} />)}{!matching.length && <p className="py-8 text-center text-xs text-slate-400">{backlog.length ? "Geen werkorders gevonden." : "Alles ingepland."}</p>}</div>
    {backlog.length > matching.length && <p className="px-3 py-2 text-[10px] text-slate-400">{matching.length} van {backlog.length}</p>}<ManualPlanning />
  </aside>;
}
function TimeTarget({ resource, date, time }: { resource: Resource; date: string; time: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `target-${resource.id}-${date}-${time}`, data: { resourceId: resource.id, date, start: time } satisfies DropData });
  return <div ref={setNodeRef} title={`${resource.name} · ${formatDate(date)} · ${formatTime(time)}`} className={`border-t ${time % 60 === 0 ? "border-slate-200/65" : "border-dashed border-slate-100"} ${isOver ? "bg-teal-200/70 ring-1 ring-inset ring-teal-500" : ""}`} />;
}
function PlannedBlock({ slot, column, columns, conflict }: { slot: PlanningSlot; column: number; columns: number; conflict: boolean }) {
  const { state, openOrder } = useApp();
  const order = state.workOrders.find(item => item.id === slot.workOrderId)!;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slot.id, data: { workOrderId: slot.workOrderId, slotId: slot.id } satisfies DragData });
  const visibleStart = Math.max(WINDOW_START, Math.min(slot.start, WINDOW_END - SLOT_STEP));
  const top = LANE_PADDING + (visibleStart - WINDOW_START) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT;
  const height = Math.max(20, (Math.min(slot.end, WINDOW_END) - visibleStart) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT);
  const outside = slot.start < WINDOW_START || slot.end > WINDOW_END;
  return <div ref={setNodeRef} style={{ top, height, left: `calc(${column / columns * 100}% + 3px)`, width: `calc(${100 / columns}% - 6px)` }} className={`group absolute z-10 flex overflow-hidden rounded-md border shadow-xs transition-[box-shadow,opacity] hover:z-20 hover:shadow-md ${isDragging ? "opacity-25" : ""} ${conflict || outside ? "border-amber-300 bg-amber-50 text-amber-950" : "border-teal-200 bg-teal-50 text-teal-950"}`}>
    <button {...attributes} {...listeners} aria-label={`Verplaats ${order.id}, ${formatDate(slot.date)}, ${formatTime(slot.start)}`} className="flex w-3.5 shrink-0 touch-none cursor-grab items-center justify-center border-r border-current/5 text-current/35 hover:bg-black/5 hover:text-current/70 active:cursor-grabbing"><GripVertical size={10} /></button>
    <button onClick={() => openOrder(order.id)} className="min-w-0 flex-1 px-1 py-0.5 text-left" title={`${customerName(state, order.customerId)} · ${order.id} · ${formatTime(slot.start)}–${formatTime(slot.end)}${conflict ? " · Overlap" : outside ? " · Buiten werktijd" : ""}`}>
      <p className="truncate text-[11px] font-semibold leading-3">{(conflict || outside) && <AlertTriangle size={9} className="mr-0.5 inline" />}{customerName(state, order.customerId)}</p>
      {height >= 26 && <p className="mt-0.5 truncate text-[9px] leading-[10px] opacity-65">{order.id}</p>}
      {height >= 48 && <p className="mt-1 truncate text-[9px] leading-[10px] tabular-nums opacity-50">{formatTime(slot.start)}–{formatTime(slot.end)}</p>}
    </button>
  </div>;
}
function PlannerLane({ resource, date, slots }: { resource: Resource; date: string; slots: PlanningSlot[] }) {
  const levels: PlanningSlot[][] = [];
  const placed = [...slots].sort((a, b) => a.start - b.start).map(slot => {
    let column = levels.findIndex(items => items.every(other => !overlaps(slot, other)));
    if (column < 0) { column = levels.length; levels.push([]); }
    levels[column].push(slot);
    return { slot, column };
  });
  return <div className="relative border-r border-b border-slate-200 bg-white" style={{ height: LANE_HEIGHT }}>
    <div className="absolute inset-x-0 grid grid-rows-20" style={{ top: LANE_PADDING, height: TIMELINE_HEIGHT }}>{times.map(time => <TimeTarget key={time} resource={resource} date={date} time={time} />)}</div>
    {placed.map(({ slot, column }) => <PlannedBlock key={slot.id} slot={slot} column={column} columns={levels.length} conflict={slots.some(other => overlaps(slot, other))} />)}
  </div>;
}
function ResourceLabel({ resource }: { resource: Resource }) {
  return <div className="sticky left-0 z-20 flex items-center border-r border-b border-slate-200 bg-white pl-3 pr-10" style={{ height: LANE_HEIGHT }}>
    <p className="text-xs font-semibold leading-5 text-slate-600">{resource.name}</p>
    {[480, 600, 720, 840, 960, 1080].map(time => <span key={time} className="absolute right-1.5 font-mono text-[9px] tabular-nums text-slate-400" style={{ top: LANE_PADDING + (time - WINDOW_START) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT - 5 }}>{formatTime(time)}</span>)}
  </div>;
}
function WeekPlanner() {
  const isMobile = useIsMobile();
  const { state } = useApp();
  const [offset, setOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState((calendarDate(state.today).getDay() + 6) % 7);
  const weekStart = addWeeks(startOfWeek(calendarDate(state.today), { weekStartsOn: 1 }), offset);
  const days = Array.from({ length: 7 }, (_, index) => format(addDays(weekStart, index), "yyyy-MM-dd"));
  const slots = activeSlots(state).filter(slot => days.includes(slot.date));
  const gridClass = "grid grid-cols-[140px_repeat(7,minmax(0,1fr))]";
  return <section aria-label="Weekplanner" className="w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} className="text-slate-400" />Week {format(weekStart, "II")}<span className="text-xs font-normal text-slate-400">{format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 6), "d MMM yyyy", { locale: nl })}</span></h2></div><div className="flex items-center gap-1"><Button variant="quiet" className="min-h-8 px-2" aria-label="Vorige week" onClick={() => setOffset(value => value - 1)}><ChevronLeft size={17} /></Button><Button variant="secondary" className="min-h-8 text-xs" onClick={() => setOffset(0)}>Vandaag</Button><Button variant="quiet" className="min-h-8 px-2" aria-label="Volgende week" onClick={() => setOffset(value => value + 1)}><ChevronRight size={17} /></Button></div></div>
    {!isMobile ? <div className="max-h-[calc(100dvh-16rem)] min-h-80 overflow-auto"><div className="min-w-[900px]">
      <div className={`${gridClass} sticky top-0 z-30 bg-slate-50`}><div className="sticky left-0 z-40 flex items-center border-r border-b border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-400">Resource</div>{days.map(date => <div key={date} className={`border-r border-b border-slate-200 px-2 py-3 ${date === state.today ? "bg-teal-50" : "bg-slate-50"}`}><p className={`text-xs font-medium capitalize ${date === state.today ? "text-teal-800" : "text-slate-500"}`}>{format(calendarDate(date), "EEE", { locale: nl })}<span className={`ml-1.5 inline-flex size-6 items-center justify-center rounded-md ${date === state.today ? "bg-teal-700 text-white" : "text-slate-700"}`}>{format(calendarDate(date), "d")}</span></p></div>)}</div>
      {state.resources.map(resource => <div key={resource.id} className={gridClass}><ResourceLabel resource={resource} />{days.map(date => <PlannerLane key={date} resource={resource} date={date} slots={slots.filter(slot => slot.resourceId === resource.id && slot.date === date)} />)}</div>)}
    </div></div> : <div><div className="grid grid-cols-7 border-b border-slate-200">{days.map((date, index) => <button key={date} aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)} className={`py-2.5 text-center text-xs ${selectedDay === index ? "bg-teal-700 font-medium text-white" : "text-slate-400 hover:bg-slate-50"}`}><span className="block capitalize">{format(calendarDate(date), "EEEEEE", { locale: nl })}</span><span className="mt-1 block">{format(calendarDate(date), "d")}</span></button>)}</div>{state.resources.map(resource => <div key={resource.id}><h3 className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">{resource.name}</h3><div className="grid grid-cols-[44px_minmax(0,1fr)]"><div className="relative border-b border-r border-slate-200" style={{ height: LANE_HEIGHT }}>{[480, 600, 720, 840, 960, 1080].map(time => <span key={time} className="absolute right-1 font-mono text-[9px] text-slate-400" style={{ top: LANE_PADDING + (time - WINDOW_START) / (WINDOW_END - WINDOW_START) * TIMELINE_HEIGHT - 5 }}>{formatTime(time)}</span>)}</div><PlannerLane resource={resource} date={days[selectedDay]} slots={slots.filter(slot => slot.resourceId === resource.id && slot.date === days[selectedDay])} /></div></div>)}</div>}
    {!state.resources.length && <p className="p-8 text-center text-sm text-slate-400">Geen resources beschikbaar.</p>}
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-[10px] text-slate-400"><span>{slots.length} afspraken</span><span className="flex items-center gap-3"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-teal-400" />Ingepland</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-400" />Overlap</span></span></div>
  </section>;
}
export function PlanningOverview() {
  const { state, dispatch } = useApp();
  const [dragging, setDragging] = useState<DragData | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  const draggedOrder = state.workOrders.find(order => order.id === dragging?.workOrderId);
  function dragStart(event: DragStartEvent) { setDragging(event.active.data.current as DragData); }
  function dragEnd(event: DragEndEvent) {
    const source = event.active.data.current as DragData | undefined;
    const target = event.over?.data.current as DropData | undefined;
    setDragging(null);
    if (source && target) dispatch({ type: "schedule", ...source, ...target });
  }
  return <>
    <h1 className="mb-5 text-2xl font-semibold tracking-tight">Planning</h1>
    <DndContext id="maintenance-planning" sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setDragging(null)} accessibility={{ screenReaderInstructions: { draggable: "Druk op spatie om een werkorder op te pakken. Gebruik de pijltjestoetsen om een tijdstip te kiezen. Druk op spatie om te plaatsen of Escape om te annuleren. Je kunt ook het formulier Afspraak plannen gebruiken." }, announcements: { onDragStart: () => "Werkorder opgepakt.", onDragOver: ({ over }) => { const target = over?.data.current as DropData | undefined; return target ? `${state.resources.find(resource => resource.id === target.resourceId)?.name}, ${formatDate(target.date)}, ${formatTime(target.start)}` : "Buiten de planner."; }, onDragEnd: () => "Sleepactie beëindigd.", onDragCancel: () => "Slepen geannuleerd." } }}>
      <div className="flex flex-col items-start gap-4 md:flex-row"><PlanningBacklog /><WeekPlanner /></div>
      <DragOverlay dropAnimation={null}>{draggedOrder && <div className="pointer-events-none w-56 rounded-xl border border-teal-400 bg-white p-3 shadow-xl ring-4 ring-teal-500/10"><p className="text-sm font-semibold text-slate-800">{customerName(state, draggedOrder.customerId)}</p><p className="mt-1 text-[11px] text-slate-400">{draggedOrder.id}</p><p className="mt-1 truncate text-xs text-slate-500">{draggedOrder.installation}</p></div>}</DragOverlay>
    </DndContext>
  </>;
}
