"use client";

import { useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { WeekView } from "@/components/calendar/week-view";
import { EventModal, type EditingEvent } from "@/components/calendar/event-modal";
import { findConflicts, type TimeBlock } from "@/domain/schedule/conflicts";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { formatDate, formatMinutes, formatTime } from "@/lib/format";

type Mode = "day" | "week" | "month" | "year";
const MODES: { key: Mode; label: string }[] = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "year", label: "Год" },
];

export default function CalendarPage() {
  const [mode, setMode] = useState<Mode>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [editingEvent, setEditingEvent] = useState<EditingEvent>(null);

  const shift = (dir: number) => {
    if (mode === "day") setCursor((c) => addDays(c, dir));
    else if (mode === "week") setCursor((c) => addWeeks(c, dir));
    else if (mode === "month") setCursor((c) => addMonths(c, dir));
    else setCursor((c) => addYears(c, dir));
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Календарь</h1>
          <p className="text-sm text-muted">{formatDate(cursor)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border p-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  mode === m.key ? "bg-primary text-primary-fg" : "hover:bg-surface-2"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setEditingEvent({ mode: "new", date: cursor })}>
            <Plus className="h-4 w-4" /> Событие
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <button onClick={() => shift(-1)} aria-label="Назад" className="rounded-lg border border-border p-1.5 hover:bg-surface-2">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => setCursor(new Date())} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2">
          Сегодня
        </button>
        <button onClick={() => shift(1)} aria-label="Вперёд" className="rounded-lg border border-border p-1.5 hover:bg-surface-2">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {mode === "day" && <DayView cursor={cursor} onEditEvent={(e) => setEditingEvent({ mode: "edit", event: e })} />}
      {mode === "week" && <WeekView cursor={cursor} />}
      {mode === "month" && <MonthView cursor={cursor} onPickDay={(d) => { setCursor(d); setMode("day"); }} />}
      {mode === "year" && <YearView cursor={cursor} onPickMonth={(d) => { setCursor(d); setMode("month"); }} />}

      {editingEvent && <EventModal editing={editingEvent} onClose={() => setEditingEvent(null)} />}
    </div>
  );
}

function DayView({ cursor, onEditEvent }: { cursor: Date; onEditEvent: (e: import("@/lib/demo/types").DemoEvent) => void }) {
  const { state, deleteEvent } = useStore();
  const events = state.events.filter((e) => isSameDay(e.start, cursor)).sort((a, b) => a.start.getTime() - b.start.getTime());
  const tasks = state.tasks.filter((t) => t.dueDate && isSameDay(t.dueDate, cursor));
  const timeblocks = tasks.filter((t) => t.scheduledStart && t.scheduledEnd);
  const planned = tasks.reduce((s, t) => s + t.plannedMinutes, 0);

  // Конфликты: фиксированные события + временные блоки задач.
  const blocks: TimeBlock[] = [
    ...events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, fixed: e.fixed })),
    ...timeblocks.map((t) => ({ id: t.id, title: t.title, start: t.scheduledStart!, end: t.scheduledEnd!, fixed: false })),
  ];
  const conflicts = findConflicts(blocks);

  return (
    <div className="space-y-3">
      {conflicts.length > 0 && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/10">
          <CardTitle className="text-[var(--warning)]">Конфликты расписания</CardTitle>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {conflicts.map((c, i) => (
              <li key={i}>«{c.a.title}» и «{c.b.title}» пересекаются на {c.overlapMinutes} мин.</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>События</CardTitle>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Событий нет.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between">
                <span>{e.title} {e.fixed ? "" : "(гибкое)"}</span>
                <span className="flex items-center gap-2 text-muted">
                  {formatTime(e.start)}–{formatTime(e.end)}
                  <button onClick={() => onEditEvent(e)} className="text-primary">изменить</button>
                  <button onClick={() => deleteEvent(e.id)} className="text-[var(--danger)]">удалить</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {timeblocks.length > 0 && (
        <Card>
          <CardTitle>Временные блоки</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {timeblocks.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span>{t.title}</span>
                <span className="text-muted">{formatTime(t.scheduledStart!)}–{formatTime(t.scheduledEnd!)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Задачи дня</CardTitle>
          <span className="text-xs text-muted">план {formatMinutes(planned)}</span>
        </div>
        {tasks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Задач на этот день нет.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span>{t.title}</span>
                <span className="text-muted">{formatMinutes(t.plannedMinutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MonthView({ cursor, onPickDay }: { cursor: Date; onPickDay: (d: Date) => void }) {
  const { state } = useStore();
  const first = startOfMonth(cursor);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });
  const count = (day: Date) =>
    state.tasks.filter((t) => t.dueDate && isSameDay(t.dueDate, day)).length +
    state.events.filter((e) => isSameDay(e.start, day)).length;

  return (
    <div className="grid grid-cols-7 gap-1">
      {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
        <div key={d} className="pb-1 text-center text-[11px] text-muted">{d}</div>
      ))}
      {days.map((day) => {
        const n = count(day);
        const inMonth = isSameMonth(day, cursor);
        const today = isSameDay(day, new Date());
        return (
          <button
            key={day.toISOString()}
            onClick={() => onPickDay(day)}
            className={`flex min-h-16 flex-col rounded-lg border p-1 text-left ${
              inMonth ? "border-border bg-surface" : "border-transparent bg-surface-2/40 text-muted"
            } ${today ? "ring-1 ring-primary" : ""}`}
          >
            <span className="text-xs font-medium">{day.getDate()}</span>
            {n > 0 && (
              <span className="mt-auto inline-flex items-center gap-1 text-[10px] text-primary">
                ● {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function YearView({ cursor, onPickMonth }: { cursor: Date; onPickMonth: (d: Date) => void }) {
  const { state } = useStore();
  const year = cursor.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Год: только крупные цели, проекты, важные сроки и нагрузка по месяцам (без мелких задач).
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {months.map((m, i) => {
          const load = state.tasks.filter(
            (t) => t.dueDate && t.dueDate.getFullYear() === year && t.dueDate.getMonth() === i,
          ).length;
          const results = state.results.filter((r) => r.zone === "now" || r.zone === "next");
          return (
            <button
              key={i}
              onClick={() => onPickMonth(m)}
              className="rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{monthNames[i]}</span>
                <span className="text-[11px] text-muted">{load > 0 ? `${load} задач` : "—"}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, load * 20)}%` }} />
              </div>
              {i === new Date().getMonth() && year === new Date().getFullYear() && (
                <p className="mt-1 text-[10px] text-primary">текущий месяц</p>
              )}
              {results.length > 0 && i === 1 && (
                <p className="mt-1 truncate text-[10px] text-muted">{results.length} активных результата</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
