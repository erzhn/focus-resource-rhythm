"use client";

import { useRef, useState } from "react";
import { setHours, setMinutes, startOfDay } from "date-fns";
import { X } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { useToast } from "@/components/ui/toast";
import { layoutDay } from "@/lib/ui/day-layout";
import { formatTime } from "@/lib/format";
import type { DemoEvent } from "@/lib/demo/types";

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 56;
const SNAP = 15;
const DAY_START_MIN = START_HOUR * 60;
const DAY_END_MIN = END_HOUR * 60;
const HEIGHT = (END_HOUR - START_HOUR) * HOUR_PX;

const yFor = (minute: number) => ((minute - DAY_START_MIN) / 60) * HOUR_PX;
const clampStart = (minute: number, duration: number) =>
  Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - duration, minute));

/** Дневной таймлайн с перетаскиванием событий по времени (шаг 15 мин). */
export function DayTimeline({
  cursor,
  now,
  onEditEvent,
}: {
  cursor: Date;
  now: Date;
  onEditEvent: (e: DemoEvent) => void;
}) {
  const { state, updateEvent, deleteEvent } = useStore();
  const toast = useToast();
  const [drag, setDrag] = useState<{ id: string; deltaMin: number } | null>(null);
  const startYRef = useRef(0);

  const isToday = startOfDay(cursor).getTime() === startOfDay(now).getTime();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nowVisible = isToday && nowMinute >= DAY_START_MIN && nowMinute <= DAY_END_MIN;

  const events = state.events.filter(
    (e) => startOfDay(e.start).getTime() === startOfDay(cursor).getTime(),
  );
  const blocks = layoutDay(events);
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const commit = (ev: DemoEvent, deltaMin: number) => {
    const duration = (ev.end.getTime() - ev.start.getTime()) / 60000;
    const origStart = ev.start.getHours() * 60 + ev.start.getMinutes();
    const newStart = clampStart(origStart + deltaMin, duration);
    if (newStart === origStart) return;
    const base = startOfDay(cursor);
    const start = setMinutes(setHours(base, Math.floor(newStart / 60)), newStart % 60);
    const end = new Date(start.getTime() + duration * 60000);
    updateEvent(ev.id, { start, end });
    toast.success(`«${ev.title}» → ${formatTime(start)}`);
  };

  return (
    <div className="rounded-[var(--r)] border border-border bg-surface p-3">
      <div className="relative flex" style={{ height: HEIGHT }}>
        {/* Часовая шкала */}
        <div className="relative w-12 shrink-0">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-muted-2"
              style={{ top: yFor(h * 60) }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Сетка + события */}
        <div className="relative flex-1 border-l border-border">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute inset-x-0 border-t border-border/60"
              style={{ top: yFor(h * 60) }}
            />
          ))}

          {nowVisible && (
            <div className="absolute inset-x-0 z-20 flex items-center" style={{ top: yFor(nowMinute) }} aria-hidden>
              <span className="-ml-1 h-2 w-2 rounded-full bg-[var(--attention)]" />
              <span className="h-px flex-1 bg-[var(--attention)]" />
              <span className="rounded bg-[var(--attention)] px-1 text-[9px] font-bold text-white">
                {formatTime(now)}
              </span>
            </div>
          )}

          {blocks.map((b) => {
            const dragging = drag?.id === b.item.id;
            const deltaMin = dragging ? drag!.deltaMin : 0;
            const top = yFor(b.startMinute + deltaMin);
            const height = (b.durationMinute / 60) * HOUR_PX;
            const widthPct = 100 / b.lanes;
            const leftPct = b.lane * widthPct;
            const flexible = !b.item.fixed;

            return (
              <div
                key={b.item.id}
                role="button"
                tabIndex={0}
                aria-label={`${b.item.title}, ${formatTime(b.item.start)}. Enter — редактировать`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditEvent(b.item);
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startYRef.current = e.clientY;
                  setDrag({ id: b.item.id, deltaMin: 0 });
                }}
                onPointerMove={(e) => {
                  if (drag?.id !== b.item.id) return;
                  const dy = e.clientY - startYRef.current;
                  const raw = (dy / HOUR_PX) * 60;
                  const snapped = Math.round(raw / SNAP) * SNAP;
                  setDrag({ id: b.item.id, deltaMin: snapped });
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
                  if (drag?.id === b.item.id) {
                    if (drag.deltaMin === 0) onEditEvent(b.item);
                    else commit(b.item, drag.deltaMin);
                  }
                  setDrag(null);
                }}
                className={`group absolute z-10 cursor-grab touch-none select-none overflow-hidden rounded-[var(--r-sm)] px-2 py-1 text-[11px] shadow-soft transition-shadow active:cursor-grabbing ${
                  dragging ? "z-30 shadow-soft-lg ring-2 ring-primary" : ""
                }`}
                style={{
                  top,
                  height: Math.max(height - 2, 16),
                  left: `calc(${leftPct}% + 4px)`,
                  width: `calc(${widthPct}% - 8px)`,
                  backgroundColor: flexible
                    ? "color-mix(in oklab, var(--zone-next) 18%, var(--surface))"
                    : "color-mix(in oklab, var(--primary) 16%, var(--surface))",
                  color: flexible ? "var(--zone-next)" : "var(--primary)",
                }}
              >
                <button
                  aria-label={`Удалить событие ${b.item.title}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteEvent(b.item.id);
                    toast.info(`Событие «${b.item.title}» удалено`);
                  }}
                  className="absolute right-0.5 top-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
                <p className="truncate pr-4 font-semibold">{b.item.title}</p>
                <p className="truncate opacity-80">
                  {formatTime(dragging ? shiftDate(b.item.start, drag!.deltaMin) : b.item.start)}
                  {" – "}
                  {formatTime(dragging ? shiftDate(b.item.end, drag!.deltaMin) : b.item.end)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-2">
        Перетащите событие вверх/вниз, чтобы изменить время (шаг 15 мин), или нажмите его для точного
        редактирования.
      </p>
    </div>
  );
}

function shiftDate(d: Date, deltaMin: number): Date {
  return new Date(d.getTime() + deltaMin * 60000);
}
