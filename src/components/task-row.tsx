"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, ChevronDown, Info, Lock, Pencil } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { useTaskEdit } from "@/components/task-edit";
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
  const color = scoreColor(score);
  return (
    <span
      className="inline-flex h-7 min-w-7 items-center justify-center gap-0.5 rounded-full px-2 text-xs font-bold tabular-nums"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color }}
      title={manual ? "Ручной приоритет" : "Системная рекомендация"}
    >
      {score}
      {manual ? "✋" : ""}
    </span>
  );
}

export function TaskRow({ task, showActions = true }: { task: DemoTask; showActions?: boolean }) {
  const { priorityOf, toggleDone, setManualPriority } = useStore();
  const { open: openEdit } = useTaskEdit();
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const p = priorityOf(task);
  const sys = p.system;
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "rounded-[var(--r)] border border-border/70 bg-surface transition-shadow hover:shadow-soft",
        done && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {showActions && (
          <button
            onClick={() => toggleDone(task.id)}
            aria-label={done ? "Вернуть в работу" : "Отметить выполненной"}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
              done ? "border-success bg-success text-white" : "border-border-strong hover:border-primary",
            )}
          >
            <motion.span initial={false} animate={{ scale: done ? 1 : 0 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 20 }}>
              <Check className="h-3 w-3" />
            </motion.span>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("relative text-sm font-medium", done && "text-muted")}>
              {task.title}
              <motion.span
                className="absolute left-0 top-1/2 h-px bg-current"
                initial={false}
                animate={{ width: done ? "100%" : "0%" }}
                transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden
              />
            </span>
            {sys.blocked && (
              <span title="Заблокирована зависимостью" className="text-muted-2">
                <Lock className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-2">
            <span>{TASK_STATUS_LABELS[task.status]}</span>
            <span>{formatMinutes(task.plannedMinutes)}</span>
            {task.dueDate && <span>срок {formatDate(task.dueDate)}</span>}
            <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-0.5 font-semibold text-primary">
              <Info className="h-3 w-3" /> почему
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
            </button>
            <button onClick={() => openEdit(task.id)} className="inline-flex items-center gap-0.5 font-semibold text-primary">
              <Pencil className="h-3 w-3" /> изменить
            </button>
          </div>
        </div>
        <PriorityPill score={p.effectiveScore} manual={p.isManual} />
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-3 py-2.5 text-xs">
              <p className="mb-2 font-medium text-foreground">{sys.explanation}</p>
              <ul className="space-y-0.5">
                {sys.factors
                  .filter((f) => f.points > 0)
                  .map((f) => (
                    <li key={f.key} className="flex justify-between text-muted">
                      <span>{f.label}: {f.reason}</span>
                      <span className="font-semibold text-foreground">+{f.points}/{f.max}</span>
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
                  className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-surface-2"
                >
                  Поднять вручную
                </button>
                {p.isManual && (
                  <button
                    onClick={() => setManualPriority(task.id, null)}
                    className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-surface-2"
                  >
                    Сбросить к системному
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
