"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";
import { TASK_STATUS_LABELS, type Scale1to5, type SchedulingMode, type TaskStatus } from "@/domain/types";
import type { RecurrenceRule, RecurrenceFrequency } from "@/domain/recurrence";

interface TaskEditContextValue {
  open: (taskId: string) => void;
}
const Ctx = createContext<TaskEditContextValue | null>(null);
export const useTaskEdit = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTaskEdit вне TaskEditProvider");
  return c;
};

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";
const scale = [1, 2, 3, 4, 5] as const;
const WEEKDAYS = [
  { n: 1, l: "Пн" }, { n: 2, l: "Вт" }, { n: 3, l: "Ср" }, { n: 4, l: "Чт" },
  { n: 5, l: "Пт" }, { n: 6, l: "Сб" }, { n: 0, l: "Вс" },
];

export function TaskEditProvider({ children }: { children: ReactNode }) {
  const { state, updateTask, setTaskStatus, addDependency, removeDependency } = useStore();
  const [taskId, setTaskId] = useState<string | null>(null);
  const task = state.tasks.find((t) => t.id === taskId) ?? null;

  const ctxValue = useMemo<TaskEditContextValue>(() => ({ open: setTaskId }), []);
  const close = () => setTaskId(null);
  const trapRef = useFocusTrap<HTMLDivElement>(task !== null, close);

  return (
    <Ctx.Provider value={ctxValue}>
      {children}
      {task && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm md:items-center md:p-4"
          onClick={close}
        >
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Редактирование задачи"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="w-full max-w-lg"
          >
          <Card className="max-h-[92vh] w-full overflow-y-auto rounded-b-none md:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Редактирование задачи</h2>
              <button onClick={close} aria-label="Закрыть" className="rounded-lg p-1 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <EditForm
              key={task.id}
              taskId={task.id}
              onClose={close}
              store={{ state, updateTask, setTaskStatus, addDependency, removeDependency }}
            />
          </Card>
          </motion.div>
        </div>
      )}
    </Ctx.Provider>
  );
}

type StoreSlice = Pick<
  ReturnType<typeof useStore>,
  "state" | "updateTask" | "setTaskStatus" | "addDependency" | "removeDependency"
>;

function EditForm({
  taskId,
  onClose,
  store,
}: {
  taskId: string;
  onClose: () => void;
  store: StoreSlice;
}) {
  const { state, updateTask, setTaskStatus, addDependency, removeDependency } = store;
  const toast = useToast();
  const task = state.tasks.find((t) => t.id === taskId)!;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [importance, setImportance] = useState<Scale1to5>(task.importance);
  const [energyRequired, setEnergyRequired] = useState<Scale1to5>(task.energyRequired);
  const [plannedMinutes, setPlannedMinutes] = useState(task.plannedMinutes);
  const [due, setDue] = useState(task.dueDate ? format(task.dueDate, "yyyy-MM-dd") : "");
  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>(task.schedulingMode);
  const [resultId, setResultId] = useState(task.resultId ?? "");
  const [expectedResult, setExpectedResult] = useState(task.expectedResult ?? "");
  const [completionCriterion, setCompletionCriterion] = useState(task.completionCriterion ?? "");
  const [nextAction, setNextAction] = useState(task.nextAction ?? "");
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(task.recurrence);
  const [scheduledStart, setScheduledStart] = useState(
    task.scheduledStart ? format(task.scheduledStart, "yyyy-MM-dd'T'HH:mm") : "",
  );
  const [scheduledEnd, setScheduledEnd] = useState(
    task.scheduledEnd ? format(task.scheduledEnd, "yyyy-MM-dd'T'HH:mm") : "",
  );
  const [depNotice, setDepNotice] = useState<string | null>(null);

  const otherTasks = state.tasks.filter((t) => t.id !== taskId);

  const save = () => {
    updateTask(taskId, {
      title: title.trim() || task.title,
      description: description.trim() || null,
      importance,
      energyRequired,
      plannedMinutes,
      dueDate: due ? new Date(due) : null,
      schedulingMode,
      resultId: resultId || null,
      linkedToActiveResult: Boolean(
        resultId && state.results.find((r) => r.id === resultId)?.zone === "now",
      ),
      expectedResult: expectedResult.trim() || null,
      completionCriterion: completionCriterion.trim() || null,
      nextAction: nextAction.trim() || null,
      recurrence,
      isRecurringToday: recurrence !== null,
      scheduledStart: schedulingMode === "timeblock" && scheduledStart ? new Date(scheduledStart) : null,
      scheduledEnd: schedulingMode === "timeblock" && scheduledEnd ? new Date(scheduledEnd) : null,
    });
    if (status !== task.status) setTaskStatus(taskId, status);
    toast.success("Задача обновлена");
    onClose();
  };

  const tryAddDep = (dependsOnId: string) => {
    if (!dependsOnId) return;
    const res = addDependency(taskId, dependsOnId);
    if (!res.ok) {
      setDepNotice(res.message);
      setTimeout(() => setDepNotice(null), 4000);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-muted">Название</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </label>

      <TextArea label="Описание" value={description} onChange={setDescription} />

      <label className="block">
        <span className="text-xs font-medium text-muted">Статус</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputCls}>
          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </label>

      <ScaleRow label="Важность (1–5)" value={importance} onChange={setImportance} />
      <ScaleRow label="Требуемый уровень сил (1–5)" value={energyRequired} onChange={setEnergyRequired} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted">Плановое время, мин</span>
          <input type="number" min={0} value={plannedMinutes} onChange={(e) => setPlannedMinutes(Number(e.target.value))} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">Срок</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-muted">Связать с результатом</span>
        <select value={resultId} onChange={(e) => setResultId(e.target.value)} className={inputCls}>
          <option value="">— без результата —</option>
          {state.results.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {(["unordered", "ordered", "timeblock"] as SchedulingMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSchedulingMode(m)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${schedulingMode === m ? "border-primary bg-primary text-primary-fg" : "border-border"}`}
          >
            {m === "unordered" ? "Без времени" : m === "ordered" ? "По порядку" : "Временной блок"}
          </button>
        ))}
      </div>

      {schedulingMode === "timeblock" && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
          <label className="block">
            <span className="text-xs font-medium text-muted">Начало блока</span>
            <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">Окончание блока</span>
            <input type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} className={inputCls} />
          </label>
        </div>
      )}

      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-xs font-medium text-primary">Результат и критерий</summary>
        <div className="mt-3 space-y-3">
          <TextArea label="Ожидаемый результат" value={expectedResult} onChange={setExpectedResult} />
          <TextArea label="Критерий выполнения" value={completionCriterion} onChange={setCompletionCriterion} />
          <TextArea label="Ближайшее физическое действие" value={nextAction} onChange={setNextAction} />
        </div>
      </details>

      <RecurrenceEditor value={recurrence} onChange={setRecurrence} startDate={task.dueDate ?? new Date()} />

      <DependencyEditor
        task={task}
        otherTasks={otherTasks}
        onAdd={tryAddDep}
        onRemove={(depId) => removeDependency(taskId, depId)}
        notice={depNotice}
      />

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button onClick={save}>Сохранить</Button>
      </div>
    </div>
  );
}

function ScaleRow({ label, value, onChange }: { label: string; value: number; onChange: (v: Scale1to5) => void }) {
  return (
    <div>
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
        {scale.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n as Scale1to5)}
            className={`h-8 w-8 rounded-lg border text-sm ${value === n ? "border-primary bg-primary text-primary-fg" : "border-border hover:bg-surface-2"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={inputCls} />
    </label>
  );
}

function RecurrenceEditor({
  value,
  onChange,
  startDate,
}: {
  value: RecurrenceRule | null;
  onChange: (r: RecurrenceRule | null) => void;
  startDate: Date;
}) {
  const enabled = value !== null;
  const rule = value ?? { frequency: "daily" as RecurrenceFrequency, startDate };

  const patch = (p: Partial<RecurrenceRule>) => onChange({ ...rule, ...p });

  return (
    <div className="rounded-xl border border-border p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { frequency: "daily", startDate } : null)}
        />
        Повторяющаяся задача
      </label>

      {enabled && (
        <div className="mt-3 space-y-3">
          <select
            value={rule.frequency}
            onChange={(e) => patch({ frequency: e.target.value as RecurrenceFrequency })}
            className={inputCls}
          >
            <option value="daily">Ежедневно</option>
            <option value="weekly">По дням недели</option>
            <option value="monthly_date">Ежемесячно по дате</option>
            <option value="monthly_rule">Ежемесячно по правилу</option>
            <option value="interval">Каждые N дней</option>
          </select>

          {rule.frequency === "weekly" && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const on = (rule.weekdays ?? []).includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() =>
                      patch({
                        weekdays: on
                          ? (rule.weekdays ?? []).filter((x) => x !== d.n)
                          : [...(rule.weekdays ?? []), d.n],
                      })
                    }
                    className={`h-8 w-9 rounded-lg border text-xs ${on ? "border-primary bg-primary text-primary-fg" : "border-border"}`}
                  >
                    {d.l}
                  </button>
                );
              })}
            </div>
          )}

          {rule.frequency === "monthly_date" && (
            <label className="block text-xs text-muted">
              День месяца
              <input
                type="number"
                min={1}
                max={31}
                value={rule.monthDay ?? 1}
                onChange={(e) => patch({ monthDay: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
          )}

          {rule.frequency === "monthly_rule" && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={String(rule.monthlyOrdinal ?? 1)}
                onChange={(e) => patch({ monthlyOrdinal: e.target.value === "last" ? "last" : (Number(e.target.value) as 1 | 2 | 3 | 4) })}
                className={inputCls}
              >
                <option value="1">Первая</option>
                <option value="2">Вторая</option>
                <option value="3">Третья</option>
                <option value="4">Четвёртая</option>
                <option value="last">Последняя</option>
              </select>
              <select
                value={rule.monthlyWeekday ?? 5}
                onChange={(e) => patch({ monthlyWeekday: Number(e.target.value) })}
                className={inputCls}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.n} value={d.n}>{d.l}</option>
                ))}
              </select>
            </div>
          )}

          {rule.frequency === "interval" && (
            <label className="block text-xs text-muted">
              Каждые N дней
              <input
                type="number"
                min={1}
                value={rule.intervalDays ?? 3}
                onChange={(e) => patch({ intervalDays: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function DependencyEditor({
  task,
  otherTasks,
  onAdd,
  onRemove,
  notice,
}: {
  task: { dependsOn: string[] };
  otherTasks: { id: string; title: string }[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  notice: string | null;
}) {
  const titleOf = (id: string) => otherTasks.find((t) => t.id === id)?.title ?? id;
  const available = otherTasks.filter((t) => !task.dependsOn.includes(t.id));

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs font-medium text-muted">Зависит от (сначала нужно завершить)</p>
      {task.dependsOn.length === 0 && <p className="mt-1 text-[11px] text-muted">Зависимостей нет.</p>}
      <div className="mt-2 space-y-1">
        {task.dependsOn.map((id) => (
          <div key={id} className="flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1 text-xs">
            <span>{titleOf(id)}</span>
            <button onClick={() => onRemove(id)} className="text-[var(--danger)]">убрать</button>
          </div>
        ))}
      </div>
      <select
        value=""
        onChange={(e) => onAdd(e.target.value)}
        className={inputCls}
      >
        <option value="">+ добавить зависимость…</option>
        {available.map((t) => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
      {notice && <p className="mt-1 text-[11px] text-[var(--warning)]">{notice}</p>}
    </div>
  );
}
