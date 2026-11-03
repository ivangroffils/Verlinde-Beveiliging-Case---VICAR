"use client";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, GripVertical, Inbox, Keyboard, MapPin, Search } from "lucide-react";
import { useApp } from "./app-provider";
import { Button, inputClass, OrderBadge, StatusBadge } from "./ui";
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
const times = Array.from({ length: (WINDOW_END - WINDOW_START) / SLOT_STEP }, (_, index) => WINDOW_START + index * SLOT_STEP);
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return undefined;
  event.preventDefault();
  const targets = context.droppableContainers.getEnabled().flatMap(container => {
    const rect = context.droppableRects.get(container.id);
    return rect ? [{ id: container.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }] : [];
  });
  const origin = targets.find(target => target.id === context.over?.id);
  if (!origin) { const first = targets[0]; return first ? { x: first.x - (context.collisionRect?.width ?? 0) / 2, y: first.y - (context.collisionRect?.height ?? 0) / 2 } : currentCoordinates; }
  const horizontal = event.code === "ArrowLeft" || event.code === "ArrowRight";
  const direction = event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 1;
  const candidates = targets.filter(target => target.id !== origin.id && (horizontal ? (target.x - origin.x) * direction > 2 : (target.y - origin.y) * direction > 2));
  candidates.sort((a, b) => {
    const score = (target: typeof a) => horizontal ? Math.abs(target.x - origin.x) + Math.abs(target.y - origin.y) * 100 : Math.abs(target.y - origin.y) + Math.abs(target.x - origin.x) * 100;
    return score(a) - score(b);
  });
  const target = candidates[0];
  return target ? { x: currentCoordinates.x + target.x - origin.x, y: currentCoordinates.y + target.y - origin.y } : currentCoordinates;
};
function WorkOrderCard({ order }: { order: WorkOrder }) {
  const { state, openOrder } = useApp();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `backlog-${order.id}`, data: { workOrderId: order.id } satisfies DragData });
  const sheet = state.sheets.find(item => order.sheetIds.includes(item.id));
  return <article ref={setNodeRef} className={`rounded-xl border bg-white p-3 shadow-xs ${isDragging ? "opacity-35" : ""} border-slate-200 hover:border-teal-400`}>
    <div className="flex items-center justify-between gap-2"><button className="min-h-8 text-xs font-bold text-teal-700 hover:underline" onClick={() => openOrder(order.id)}>{order.id}</button><OrderBadge order={order} /><button {...attributes} {...listeners} aria-label={`Sleep ${order.id} naar de planner`} className="flex size-8 touch-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-teal-700"><GripVertical size={17} /></button></div>
    <button onClick={() => openOrder(order.id)} className="mt-1 w-full text-left"><p className="text-sm font-semibold text-slate-800">{customerName(state, order.customerId)}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{order.installation}</p></button>
    <p className="mt-2 flex items-start gap-1 text-[10px] leading-4 text-slate-400"><MapPin size={12} className="mt-0.5 shrink-0" />{order.site}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2">{sheet ? <StatusBadge status={maintenanceStatus(sheet, state.today)} /> : <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{order.kind}</span>}<span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400"><Clock3 size={11} />2 uur</span></div>
    {order.hasInvalidPlanning && <p className="mt-2 flex items-start gap-1 rounded bg-amber-50 p-2 text-[10px] leading-4 text-amber-800"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Ongeldige bronplanning · opnieuw inplannen</p>}
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
  const orderSlots = state.slots.filter(slot => slot.workOrderId === orderId);
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
    dispatch({ type: "schedule", workOrderId: orderId, resourceId, date, start: parseTime(start) ?? -1, slotId: slotId || orderSlots[0]?.id });
  }
  const selectedSlot = orderSlots.find(item => item.id === slotId) ?? orderSlots[0];
  const duration = selectedSlot ? selectedSlot.end - selectedSlot.start : DEFAULT_DURATION;
  return <details className="border-t border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer text-xs font-semibold text-slate-600"><Keyboard size={15} className="mr-2 inline" />Plannen zonder slepen</summary><form onSubmit={submit} className="mt-4 space-y-3 text-xs"><label htmlFor={`${prefix}-order`} className="block font-medium">Werkorder</label><select id={`${prefix}-order`} value={orderId} onChange={event => selectOrder(event.target.value)} className={`${inputClass} w-full`}>{!active.length && <option value="">Geen actieve werkorders</option>}{active.map(order => <option key={order.id} value={order.id}>{order.id} · {order.status === "planned" ? "verplaatsen" : "inplannen"}</option>)}</select>
    {orderSlots.length > 1 && <label className="block">Afspraak<select className={`${inputClass} mt-1 w-full`} value={slotId || orderSlots[0]?.id} onChange={event => selectSlot(event.target.value)}>{orderSlots.map(slot => <option key={slot.id} value={slot.id}>{formatDate(slot.date)} · {formatTime(slot.start)}</option>)}</select></label>}
    <label className="block font-medium">Resource<select value={resourceId} onChange={event => setResourceId(event.target.value)} className={`${inputClass} mt-1 w-full`} required>{state.resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="font-medium">Datum<input type="date" required value={date} onChange={event => setDate(event.target.value)} className={`${inputClass} mt-1 w-full min-w-0`} /></label><label className="font-medium">Starttijd<select value={start} onChange={event => setStart(event.target.value)} className={`${inputClass} mt-1 w-full`}>{times.map(time => <option key={time} value={formatTime(time)}>{formatTime(time)}</option>)}</select></label></div><p className="text-slate-500">Duur: {duration / 60} uur · {orderSlots.length ? "bestaande duur behouden" : "standaardduur"}</p><Button className="w-full" type="submit" disabled={!orderId || !resourceId}>{orderSlots.length ? "Afspraak verplaatsen" : "Werkorder inplannen"}</Button></form></details>;
}
function PlanningBacklog() {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const backlog = state.workOrders.filter(order => order.status === "unplanned");
  const matching = backlog.filter(order => `${order.id} ${customerName(state, order.customerId)} ${order.installation} ${order.site}`.toLowerCase().includes(query.toLowerCase()));
  return <aside aria-label="Ongeplande werkorders" className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs lg:w-72"><div className="p-4"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><Inbox size={17} className="text-teal-700" />Nog in te plannen</h2><span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{backlog.length}</span></div><p className="mt-2 text-xs leading-5 text-slate-400">Sleep een werkorder naar een vrij tijdstip.<br />Een nieuwe afspraak duurt 2 uur.</p><label className="relative mt-4 block"><span className="sr-only">Zoek in backlog</span><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek werkorder…" className={`${inputClass} w-full pl-9`} /></label></div><div className="max-h-[430px] flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-3 lg:max-h-[630px]">{matching.map(order => <WorkOrderCard key={order.id} order={order} />)}{!matching.length && <p className="py-8 text-center text-xs text-slate-500">{backlog.length ? "Geen werkorders gevonden." : "Alles is ingepland."}</p>}</div><ManualPlanning /></aside>;
}
function TimeTarget({ resource, date, time }: { resource: Resource; date: string; time: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `target-${resource.id}-${date}-${time}`, data: { resourceId: resource.id, date, start: time } satisfies DropData });
  return <div ref={setNodeRef} title={`${resource.name} · ${formatDate(date)} · ${formatTime(time)}`} className={`h-full border-r border-slate-100 last:border-r-0 ${isOver ? "bg-teal-200 ring-2 ring-inset ring-teal-500" : time % 60 === 0 ? "bg-white" : "bg-slate-50/50"}`} />;
}
function PlannedBlock({ slot, top, conflict }: { slot: PlanningSlot; top: number; conflict: boolean }) {
  const { state, openOrder } = useApp();
  const order = state.workOrders.find(item => item.id === slot.workOrderId)!;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slot.id, data: { workOrderId: slot.workOrderId, slotId: slot.id } satisfies DragData });
  return <div ref={setNodeRef} style={{ left: `${(slot.start - WINDOW_START) / (WINDOW_END - WINDOW_START) * 100}%`, width: `${(slot.end - slot.start) / (WINDOW_END - WINDOW_START) * 100}%`, top }} className={`absolute z-10 flex h-[52px] min-w-3 items-stretch overflow-hidden rounded-md border shadow-xs ${isDragging ? "opacity-30" : ""} ${conflict ? "border-amber-400 bg-amber-50 text-amber-950" : "border-teal-300 bg-teal-50 text-teal-950"}`}>
    <button {...attributes} {...listeners} aria-label={`Verplaats ${order.id}, ${formatDate(slot.date)}, ${formatTime(slot.start)}`} className="flex w-5 shrink-0 touch-none items-center justify-center bg-black/3 hover:bg-black/10"><GripVertical size={13} /></button><button onClick={() => openOrder(order.id)} className="min-w-0 flex-1 px-1.5 text-left" title={`${order.id} · ${customerName(state, order.customerId)} · ${formatTime(slot.start)}–${formatTime(slot.end)}${conflict ? " · Bestaand planningsconflict" : ""}`}><p className="truncate text-[10px] font-bold">{conflict && <AlertTriangle size={10} className="mr-1 inline" />}{order.id}</p><p className="truncate text-[9px]">{customerName(state, order.customerId)}</p><p className="truncate text-[9px] opacity-65">{formatTime(slot.start)}–{formatTime(slot.end)}</p></button>
  </div>;
}
function PlannerLane({ resource, date, slots, height }: { resource: Resource; date: string; slots: PlanningSlot[]; height: number }) {
  const levels: PlanningSlot[][] = [];
  const placed = [...slots].sort((a, b) => a.start - b.start).map(slot => {
    let level = levels.findIndex(items => items.every(other => !overlaps(slot, other)));
    if (level < 0) { level = levels.length; levels.push([]); }
    levels[level].push(slot); return { slot, level };
  });
  return <div className="relative border-r border-b border-slate-200" style={{ height: Math.max(height, levels.length * 58 + 20) }}><div className="absolute inset-0 grid grid-cols-20">{times.map(time => <TimeTarget key={time} resource={resource} date={date} time={time} />)}</div>{placed.map(({ slot, level }) => <PlannedBlock key={slot.id} slot={slot} top={10 + level * 58} conflict={slots.some(other => overlaps(slot, other))} />)}</div>;
}
function WeekPlanner() {
  const isMobile = useIsMobile();
  const { state } = useApp();
  const [offset, setOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState((calendarDate(state.today).getDay() + 6) % 7);
  const weekStart = addWeeks(startOfWeek(calendarDate(state.today), { weekStartsOn: 1 }), offset);
  const days = Array.from({ length: 7 }, (_, index) => format(addDays(weekStart, index), "yyyy-MM-dd"));
  const slots = activeSlots(state).filter(slot => days.includes(slot.date));
  const rowHeight = (resourceId: string) => Math.max(100, ...days.map(date => slots.filter(slot => slot.resourceId === resourceId && slot.date === date).length * 58 + 20));
  return <section aria-label="Weekplanner" className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h2 className="flex items-center gap-2 text-sm font-bold"><CalendarDays size={17} className="text-teal-700" />Week {format(weekStart, "II")}<span className="font-normal text-slate-400">· {format(weekStart, "yyyy")}</span></h2><p className="mt-1 text-xs text-slate-500">{format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 6), "d MMM", { locale: nl })}</p></div><div className="flex items-center gap-1"><Button variant="secondary" className="min-h-9" onClick={() => setOffset(0)}>Vandaag</Button><Button variant="quiet" aria-label="Vorige week" onClick={() => setOffset(value => value - 1)}><ChevronLeft size={18} /></Button><Button variant="quiet" aria-label="Volgende week" onClick={() => setOffset(value => value + 1)}><ChevronRight size={18} /></Button></div></div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-3 text-[10px] text-slate-500"><span>{state.resources.length} resources · {slots.length} afspraken deze week</span><span>08:00–18:00 · stappen van 30 min</span></div>
    {!isMobile && <div className="max-h-[790px] overflow-auto"><div className="min-w-[2100px]"><div className="sticky top-0 z-20 grid grid-cols-[170px_repeat(7,minmax(0,1fr))] bg-white"><div className="sticky left-0 z-30 flex items-center border-r border-b border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-500">Resource</div>{days.map(date => <div key={date} className={`border-r border-b border-slate-200 px-3 pt-3 ${date === state.today ? "bg-teal-50" : "bg-slate-50"}`}><p className={`text-xs font-semibold capitalize ${date === state.today ? "text-teal-800" : "text-slate-600"}`}>{format(calendarDate(date), "EEEE d MMM", { locale: nl })}{date === state.today && <span className="ml-2 rounded bg-teal-600 px-1 py-0.5 text-[9px] text-white">Vandaag</span>}</p><div className="mt-3 flex justify-between pb-1 font-mono text-[9px] text-slate-400"><span>08:00</span><span>12:00</span><span>18:00</span></div></div>)}</div>{state.resources.map(resource => <div key={resource.id} className="grid grid-cols-[170px_repeat(7,minmax(0,1fr))]"><div className="sticky left-0 z-20 flex items-center gap-2 border-r border-b border-slate-200 bg-white px-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{resource.name.split(" ").slice(0, 2).map(word => word[0]).join("")}</span><div><p className="text-xs font-semibold leading-5">{resource.name}</p><p className="text-[9px] text-slate-400">{resource.role}</p></div></div>{days.map(date => <PlannerLane key={date} resource={resource} date={date} slots={slots.filter(slot => slot.resourceId === resource.id && slot.date === date)} height={rowHeight(resource.id)} />)}</div>)}</div></div>}
    {isMobile && <div><div className="grid grid-cols-7 border-b border-slate-200">{days.map((date, index) => <button key={date} aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)} className={`py-3 text-center text-xs ${selectedDay === index ? "bg-teal-700 font-semibold text-white" : "text-slate-500"}`}><span className="block capitalize">{format(calendarDate(date), "EEEEEE", { locale: nl })}</span><span className="mt-1 block">{format(calendarDate(date), "d")}</span></button>)}</div>{state.resources.map(resource => <div key={resource.id}><h3 className="px-4 pt-4 text-sm font-semibold">{resource.name}</h3><div className="flex justify-between px-4 pb-1 pt-2 font-mono text-[9px] text-slate-400"><span>08:00</span><span>12:00</span><span>18:00</span></div><PlannerLane resource={resource} date={days[selectedDay]} slots={slots.filter(slot => slot.resourceId === resource.id && slot.date === days[selectedDay])} height={100} /></div>)}</div>}
    {!state.resources.length && <p className="p-8 text-center text-sm text-slate-500">Geen resources beschikbaar. Controleer de CSV-export.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-[10px] text-slate-400"><div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-teal-400" />Ingepland</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-amber-400" />Bestaand conflict</span></div><span className="hidden md:block">Schuif horizontaal voor de volledige week →</span></div>
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
  return <><div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-teal-700">Werkvoorbereiding</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Planning</h1><p className="mt-2 text-sm text-slate-500">Van werkorder naar afspraak. Sleep, plan en verplaats in één overzicht.</p></div>
    <DndContext id="maintenance-planning" sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setDragging(null)} accessibility={{ screenReaderInstructions: { draggable: "Druk op spatie om een werkorder op te pakken. Gebruik de pijltjestoetsen om een tijdstip te kiezen. Druk op spatie om te plaatsen of Escape om te annuleren. Je kunt ook het formulier Plannen zonder slepen gebruiken." }, announcements: { onDragStart: () => "Werkorder opgepakt. Kies een resource, datum en tijdstip.", onDragOver: ({ over }) => { const target = over?.data.current as DropData | undefined; return target ? `${state.resources.find(resource => resource.id === target.resourceId)?.name}, ${formatDate(target.date)}, ${formatTime(target.start)}` : "Buiten de planner."; }, onDragEnd: () => "Sleepactie beëindigd. Controleer de planningsmelding.", onDragCancel: () => "Slepen geannuleerd." } }}>
      <div className="flex flex-col items-start gap-5 lg:flex-row"><PlanningBacklog /><WeekPlanner /></div><DragOverlay dropAnimation={null}>{draggedOrder && <div className="pointer-events-none"><div className="w-64 rounded-xl border border-teal-400 bg-white p-4 shadow-xl"><p className="text-xs font-bold text-teal-700">{draggedOrder.id}</p><p className="mt-2 text-sm font-semibold">{customerName(state, draggedOrder.customerId)}</p><p className="mt-1 truncate text-xs text-slate-500">{draggedOrder.installation}</p></div></div>}</DragOverlay>
    </DndContext><div className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-white/70 p-3 text-xs leading-5 text-slate-500"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" /><p>De bron bevat ongeldige en overlappende planning. Ongeldige afspraken zijn niet hersteld: de actieve werkorders staan in de backlog. Nieuwe planning wordt altijd op conflicten gecontroleerd.</p></div>
  </>;
}
