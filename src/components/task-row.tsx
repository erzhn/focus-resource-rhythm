"use client";

import { useState } from "react";
import { AlertTriangle, Check, Info, Lock } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import type { DemoTask } from "@/lib/demo/types";
import { TASK_STATUS_LABELS } from "@/domain/types";
import { formatDate, formatMinutes } from "@/lib/format";
import { cn } from "@/lib/cn";

function scoreColor(score: number) {
  if (score >= 70) return "var(--danger)";
  if (score >= 40) return "var(--warning)";
  return "var(--muted)";
}

export function PriorityPill({ score, manual }: { score: number; manual?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${scoreColor(score)}22`, color: scoreColor(score) }}
      title={manual ? "Ручной приоритет" : "Системная рекомендация"}
    >
      {score}
      {manual ? " ✋" : ""}
    </span>
  );
}

export function TaskRow({ task, showActions = true }: { task: DemoTask; showActions?: boolean }) {
  const { priorityOf, toggleDone, setManualPriority } = useStore();
  const [expanded, setExpanded] = useState(false);
  const p = priorityOf(task);
  const sys = p.system;
  const done = task.status === "done";

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-start gap-3 p-3">
        {showActions && (
          <button
            onClick={() => toggleDone(task.id)}
            aria-label={done ? "Вернуть в работу" : "Отметить выполненной"}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
              done ? "border-success bg-success text-white" : "border-border",
            )}
          >
            {done && <Check className="h-3.5 w-3.5" />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium", done && "line-through text-muted")}>
              {task.title}
            </span>
            {sys.blocked && (
              <span title="Заблокирована зависимостью" className="text-[var(--muted)]">
                <Lock className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>{TASK_STATUS_LABELS[task.status]}</span>
            <span>{formatMinutes(task.plannedMinutes)}</span>
            {task.dueDate && <span>срок {formatDate(task.dueDate)}</span>}
            <button onClick={() => setExpanded((v) => !v)} className="text-primary">
              <Info className="mr-0.5 inline h-3 w-3" />
              почему
            </button>
          </div>
        </div>
        <PriorityPill score={p.effectiveScore} manual={p.isManual} />
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-2 text-xs">
          <p className="mb-2 text-foreground">{sys.explanation}</p>
          <ul className="space-y-0.5">
            {sys.factors
              .filter((f) => f.points > 0)
              .map((f) => (
                <li key={f.key} className="flex justify-between text-muted">
                  <span>{f.label}: {f.reason}</span>
                  <span className="font-medium text-foreground">
                    +{f.points}/{f.max}
                  </span>
                </li>
              ))}
          </ul>
          {sys.resourceWarnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {sys.resourceWarnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1 text-[var(--warning)]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
          {p.isManual && (
            <p className="mt-2 text-muted">
              Ручной приоритет: {p.manual?.score}. Системная рекомендация была: {sys.score}.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => setManualPriority(task.id, Math.min(100, p.effectiveScore + 10))}
              className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-surface-2"
            >
              Поднять вручную
            </button>
            {p.isManual && (
              <button
                onClick={() => setManualPriority(task.id, null)}
                className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-surface-2"
              >
                Сбросить к системному
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
