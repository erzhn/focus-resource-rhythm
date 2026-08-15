"use client";

import { useState } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { X } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Button, Card } from "@/components/ui/primitives";
import type { DemoEvent } from "@/lib/demo/types";

export type EditingEvent =
  | { mode: "new"; date: Date }
  | { mode: "edit"; event: DemoEvent }
  | null;

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

function combine(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  return setMinutes(setHours(new Date(dateStr), h), m);
}

export function EventModal({ editing, onClose }: { editing: NonNullable<EditingEvent>; onClose: () => void }) {
  const { addEvent, updateEvent } = useStore();
  const existing = editing.mode === "edit" ? editing.event : null;
  const baseDate = editing.mode === "new" ? editing.date : editing.event.start;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(format(baseDate, "yyyy-MM-dd"));
  const [start, setStart] = useState(existing ? format(existing.start, "HH:mm") : "10:00");
  const [end, setEnd] = useState(existing ? format(existing.end, "HH:mm") : "11:00");
  const [fixed, setFixed] = useState(existing?.fixed ?? true);
  const [blocksAvailability, setBlocksAvailability] = useState(existing?.blocksAvailability ?? true);

  const save = () => {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      start: combine(date, start),
      end: combine(date, end),
      fixed,
      blocksAvailability,
    };
    if (existing) updateEvent(existing.id, payload);
    else addEvent(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4">
      <Card className="w-full max-w-md rounded-b-none md:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {existing ? "Редактирование события" : "Новое событие"}
          </h2>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1 hover:bg-surface-2">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted">Название</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">Дата</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted">Начало</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Окончание</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} />
              Фиксированное
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={blocksAvailability}
                onChange={(e) => setBlocksAvailability(e.target.checked)}
              />
              Занимает время (блокирует доступность)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button onClick={save} disabled={!title.trim()}>Сохранить</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
