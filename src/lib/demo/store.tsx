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
import type { DemoState, DemoTask } from "./types";

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
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore должен использоваться внутри DemoStoreProvider");
  return ctx;
}
