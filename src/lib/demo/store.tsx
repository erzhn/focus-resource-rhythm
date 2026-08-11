"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { canAddToNow, type FocusResult, type FocusZone } from "@/domain/focus";
import { buildDayPlan, type DayPlanDraft } from "@/domain/planning/dayPlan";
import { calculatePriority, resolvePriority, type PriorityContext } from "@/domain/priority";
import type { DayResources, DomainTask } from "@/domain/types";
import { createSeedState } from "./seed";
import type { DemoState, DemoTask, ResultDecision } from "./types";
import type { TaskStatus } from "@/domain/types";

interface StoreValue {
  state: DemoState;
  now: Date;
  resources: DayResources;
  priorityContext: PriorityContext;
  /** Приоритет задачи (эффективный + системный + признак ручного). */
  priorityOf: (task: DemoTask) => ReturnType<typeof resolvePriority>;
  dayPlan: DayPlanDraft;
  focusResults: FocusResult[];
  addTask: (task: Partial<DemoTask> & { title: string }) => string;
  updateTask: (id: string, patch: Partial<DemoTask>) => void;
  toggleDone: (id: string) => void;
  setManualPriority: (id: string, score: number | null, note?: string) => void;
  moveZone: (resultId: string, zone: FocusZone) => { ok: boolean; message: string };
  confirmDayPlan: () => void;
  setMorningEnergy: (v: number) => void;
  setAvailableMinutes: (v: number) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  /** Перенос задачи с обязательной причиной (методика: причина обязательна). */
  postponeTask: (id: string, toDate: Date, reason: string) => void;
  /** Разделить задачу на части (каждая — новая задача, исходная — отменяется). */
  splitTask: (id: string, parts: string[]) => void;
  setEveningEnergy: (v: number) => void;
  saveEveningReview: (conclusion: string) => void;
  setNextWeekResults: (titles: string[]) => void;
  decideResult: (resultId: string, decision: ResultDecision, reason: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

let counter = 0;
const nextId = () => `t-new-${++counter}`;

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  // Фиксируем «сегодня» на момент монтирования, чтобы расчёты были стабильны.
  const [now] = useState(() => new Date());
  const [state, setState] = useState<DemoState>(() => createSeedState(now));

  const resources: DayResources = useMemo(
    () => ({
      availableMinutes: state.availableMinutes,
      energyLevel: state.morningEnergy as DayResources["energyLevel"],
      moneyLimitMinor:
        state.dailyMoneyLimitMajor === null ? null : state.dailyMoneyLimitMajor * 100,
      reserveRatio: state.reserveRatio,
    }),
    [state.availableMinutes, state.morningEnergy, state.dailyMoneyLimitMajor, state.reserveRatio],
  );

  const completedTaskIds = useMemo(
    () => new Set(state.tasks.filter((t) => t.status === "done").map((t) => t.id)),
    [state.tasks],
  );

  const priorityContext: PriorityContext = useMemo(
    () => ({ now, resources, completedTaskIds }),
    [now, resources, completedTaskIds],
  );

  const priorityOf = useCallback(
    (task: DemoTask) => {
      const system = calculatePriority(task as DomainTask, priorityContext);
      const manual =
        task.manualPriority === null
          ? null
          : { score: task.manualPriority, note: task.manualPriorityNote, at: now };
      return resolvePriority(system, manual);
    },
    [priorityContext, now],
  );

  const dayPlan = useMemo(
    () => buildDayPlan(state.tasks as DomainTask[], resources, priorityContext),
    [state.tasks, resources, priorityContext],
  );

  const focusResults: FocusResult[] = useMemo(
    () =>
      state.results.map((r) => ({
        id: r.id,
        title: r.title,
        zone: r.zone,
        hasNextAction: state.tasks.some(
          (t) => t.resultId === r.id && t.status !== "done" && t.status !== "cancelled",
        ),
      })),
    [state.results, state.tasks],
  );

  const addTask = useCallback<StoreValue["addTask"]>((task) => {
    const id = nextId();
    setState((s) => ({
      ...s,
      tasks: [
        {
          id,
          title: task.title,
          status: task.status ?? "inbox",
          dueDate: task.dueDate ?? null,
          importance: task.importance ?? 3,
          consequence: task.consequence ?? 3,
          goalLink: task.goalLink ?? 3,
          energyRequired: task.energyRequired ?? 3,
          plannedMinutes: task.plannedMinutes ?? 30,
          plannedMoneyMinor: task.plannedMoneyMinor ?? 0,
          schedulingMode: task.schedulingMode ?? "unordered",
          isRecurringToday: task.isRecurringToday ?? false,
          unblocks: task.unblocks ?? [],
          dependsOn: task.dependsOn ?? [],
          linkedToActiveResult: task.linkedToActiveResult ?? false,
          description: task.description ?? null,
          resultId: task.resultId ?? null,
          manualPriority: null,
          manualPriorityNote: null,
        },
        ...s.tasks,
      ],
    }));
    return id;
  }, []);

  const updateTask = useCallback<StoreValue["updateTask"]>((id, patch) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const toggleDone = useCallback<StoreValue["toggleDone"]>((id) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: t.status === "done" ? "planned" : "done" } : t,
      ),
    }));
  }, []);

  const setManualPriority = useCallback<StoreValue["setManualPriority"]>((id, score, note) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, manualPriority: score, manualPriorityNote: score === null ? null : note ?? null }
          : t,
      ),
    }));
  }, []);

  const moveZone = useCallback<StoreValue["moveZone"]>(
    (resultId, zone) => {
      let result = { ok: true, message: "" };
      setState((s) => {
        if (zone === "now") {
          const check = canAddToNow(
            s.results
              .filter((r) => r.id !== resultId)
              .map((r) => ({ id: r.id, title: r.title, zone: r.zone, hasNextAction: true })),
          );
          if (!check.allowed) {
            result = { ok: false, message: check.message };
            return s;
          }
        }
        result = { ok: true, message: "Зона обновлена." };
        return {
          ...s,
          results: s.results.map((r) => (r.id === resultId ? { ...r, zone } : r)),
        };
      });
      return result;
    },
    [],
  );

  const confirmDayPlan = useCallback(() => {
    setState((s) => ({ ...s, dayPlanConfirmed: true }));
  }, []);

  const setTaskStatus = useCallback<StoreValue["setTaskStatus"]>((id, status) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
  }, []);

  const postponeTask = useCallback<StoreValue["postponeTask"]>((id, toDate, reason) => {
    if (!reason.trim()) return; // причина обязательна
    setState((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return s;
      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: "postponed", dueDate: toDate } : t,
        ),
        postponements: [
          {
            id: nextId(),
            taskId: id,
            taskTitle: task.title,
            toDate,
            reason: reason.trim(),
            at: now,
          },
          ...s.postponements,
        ],
      };
    });
  }, [now]);

  const splitTask = useCallback<StoreValue["splitTask"]>((id, parts) => {
    const clean = parts.map((p) => p.trim()).filter(Boolean);
    if (clean.length === 0) return;
    setState((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return s;
      const newTasks: DemoTask[] = clean.map((title) => ({
        ...task,
        id: nextId(),
        title,
        status: "planned",
        plannedMinutes: Math.max(5, Math.round(task.plannedMinutes / clean.length)),
      }));
      return {
        ...s,
        tasks: [
          ...newTasks,
          ...s.tasks.map((t) => (t.id === id ? { ...t, status: "cancelled" as TaskStatus } : t)),
        ],
      };
    });
  }, []);

  const setEveningEnergy = useCallback<StoreValue["setEveningEnergy"]>((v) => {
    setState((s) => ({ ...s, eveningEnergy: Math.max(1, Math.min(5, v)) }));
  }, []);

  const saveEveningReview = useCallback<StoreValue["saveEveningReview"]>((conclusion) => {
    setState((s) => ({ ...s, eveningConclusion: conclusion }));
  }, []);

  const setNextWeekResults = useCallback<StoreValue["setNextWeekResults"]>((titles) => {
    setState((s) => ({ ...s, nextWeekResults: titles.slice(0, 3) }));
  }, []);

  const decideResult = useCallback<StoreValue["decideResult"]>((resultId, decision, reason) => {
    setState((s) => {
      // Отображение решения на зону результата.
      const zoneByDecision: Record<ResultDecision, DemoState["results"][number]["zone"] | null> = {
        continue: null,
        change: null,
        postpone: "next",
        pause: "later",
        decline: "declined",
      };
      const zone = zoneByDecision[decision];
      return {
        ...s,
        results: zone
          ? s.results.map((r) => (r.id === resultId ? { ...r, zone } : r))
          : s.results,
        weeklyDecisions: [
          ...s.weeklyDecisions.filter((d) => d.resultId !== resultId),
          { resultId, decision, reason: reason.trim() },
        ],
      };
    });
  }, []);

  const setMorningEnergy = useCallback((v: number) => {
    setState((s) => ({ ...s, morningEnergy: Math.max(1, Math.min(5, v)) }));
  }, []);

  const setAvailableMinutes = useCallback((v: number) => {
    setState((s) => ({ ...s, availableMinutes: Math.max(0, v) }));
  }, []);

  const value: StoreValue = {
    state,
    now,
    resources,
    priorityContext,
    priorityOf,
    dayPlan,
    focusResults,
    addTask,
    updateTask,
    toggleDone,
    setManualPriority,
    moveZone,
    confirmDayPlan,
    setMorningEnergy,
    setAvailableMinutes,
    setTaskStatus,
    postponeTask,
    splitTask,
    setEveningEnergy,
    saveEveningReview,
    setNextWeekResults,
    decideResult,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore должен использоваться внутри DemoStoreProvider");
  return ctx;
}
