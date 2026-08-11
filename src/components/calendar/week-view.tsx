"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { addDays, isSameDay, startOfWeek } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { plannableMinutes } from "@/domain/resources";
import { findConflicts, type TimeBlock } from "@/domain/schedule/conflicts";
import { formatMinutes, formatTime } from "@/lib/format";
import type { DemoTask } from "@/lib/demo/types";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function DayColumn({
  day,
  tasks,
  events,
  overloaded,
  conflict,
  onMove,
}: {
  day: Date;
  tasks: DemoTask[];
  events: { id: string; title: string; start: Date; end: Date }[];
  overloaded: boolean;
  conflict: boolean;
  onMove: (taskId: string, deltaDays: number) => void;
}) {
  const id = day.toISOString();
  const { setNodeRef, isOver } = useDroppable({ id });
  const today = isSameDay(day, new Date());

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-52 flex-col rounded-xl border p-2 transition ${
        isOver ? "border-primary bg-surface-2" : "border-border bg-surface"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-semibold ${today ? "text-primary" : "text-muted"}`}>
          {WEEKDAYS[(day.getDay() + 6) % 7]} {day.getDate()}
        </span>
        {(overloaded || conflict) && (
          <span title={conflict ? "Конфликт событий" : "Перегрузка по времени"}>
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {events.map((e) => (
          <div key={e.id} className="rounded-lg bg-[var(--zone-next)]/15 px-2 py-1 text-[11px] text-[var(--zone-next)]">
            {formatTime(e.start)} {e.title}
          </div>
        ))}
        {tasks.map((t) => (
          <DraggableTask key={t.id} task={t} onMove={onMove} />
        ))}
        {tasks.length === 0 && events.length === 0 && (
          <p className="text-[11px] text-muted">—</p>
        )}
      </div>
    </div>
  );
}

function DraggableTask({ task, onMove }: { task: DemoTask; onMove: (id: string, d: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-1">
        {/* Альтернатива drag-and-drop для клавиатуры/мобильных: перенос по дням. */}
        <button
          aria-label="Перенести на день раньше"
          onClick={() => onMove(task.id, -1)}
          className="rounded p-0.5 hover:bg-border"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="flex-1 cursor-grab touch-none select-none" {...listeners} {...attributes}>
          {task.title}
        </span>
        <button
          aria-label="Перенести на день позже"
          onClick={() => onMove(task.id, 1)}
          className="rounded p-0.5 hover:bg-border"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <span className="text-muted">{formatMinutes(task.plannedMinutes)}</span>
    </div>
  );
}

export function WeekView({ cursor }: { cursor: Date }) {
  const { state, updateTask, resources } = useStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const budget = plannableMinutes(resources.availableMinutes, resources.reserveRatio);

  const tasksOn = (day: Date) => state.tasks.filter((t) => t.dueDate && isSameDay(t.dueDate, day));
  const eventsOn = (day: Date) =>
    state.events
      .filter((e) => isSameDay(e.start, day))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const targetDay = new Date(e.over.id as string);
    updateTask(e.active.id as string, { dueDate: targetDay });
  };

  const moveByDays = (taskId: string, delta: number) => {
    const task = state.tasks.find((t) => t.id === taskId);
    const base = task?.dueDate ?? cursor;
    updateTask(taskId, { dueDate: addDays(base, delta) });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const dayTasks = tasksOn(day);
          const dayEvents = eventsOn(day);
          const planned = dayTasks.reduce((s, t) => s + t.plannedMinutes, 0);
          const blocks: TimeBlock[] = dayEvents.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            fixed: true,
          }));
          return (
            <DayColumn
              key={day.toISOString()}
              day={day}
              tasks={dayTasks}
              events={dayEvents}
              overloaded={planned > budget}
              conflict={findConflicts(blocks).length > 0}
              onMove={moveByDays}
            />
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Перетащите задачу между днями или используйте стрелки ← → (доступно с клавиатуры и на телефоне).
        После переноса нагрузка пересчитывается; перегрузка и конфликты помечаются значком.
      </p>
    </DndContext>
  );
}
