"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { canAddToNow, type FocusResult, type FocusZone } from "@/domain/focus";
import { buildDayPlan, type DayPlanDraft } from "@/domain/planning/dayPlan";
import { calculatePriority, resolvePriority, type PriorityContext } from "@/domain/priority";
import { createsDependencyCycle } from "@/domain/tasks/dependencies";
import type { DayResources, DomainTask } from "@/domain/types";
import { createEmptyState, createSeedState } from "./seed";
import type { DemoState, DemoTask, ResultDecision } from "./types";
import type { TaskStatus } from "@/domain/types";
import { isSupabaseConfigured } from "@/lib/env";
import type { DataProvider, OnboardingInput } from "@/lib/data/provider";
import { DemoDataProvider } from "@/lib/data/demo-provider";
import { SupabaseDataProvider } from "@/lib/data/supabase-provider";

interface StoreValue {
  state: DemoState;
  now: Date;
  /** Режим источника данных. */
  mode: "demo" | "supabase";
  /** Идёт первичная загрузка снимка (для реального режима). */
  loading: boolean;
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
  saveOnboarding: (input: OnboardingInput) => void;
  /** Добавить зависимость (taskId зависит от dependsOnId). Возвращает ошибку при цикле. */
  addDependency: (taskId: string, dependsOnId: string) => { ok: boolean; message: string };
  removeDependency: (taskId: string, dependsOnId: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Стабильный uuid — годится и для демо, и для вставки в Supabase (uuid-колонки). */
const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  // Фиксируем «сегодня» на момент монтирования, чтобы расчёты были стабильны.
  const [now] = useState(() => new Date());
  // Провайдер данных выбирается один раз: реальный Supabase или демо (память).
  const [provider] = useState<DataProvider>(() =>
    isSupabaseConfigured ? new SupabaseDataProvider() : new DemoDataProvider(),
  );

  const [state, setState] = useState<DemoState>(() =>
    provider.mode === "demo" ? createSeedState(now) : createEmptyState(),
  );
  const [loading, setLoading] = useState(provider.mode === "supabase");

  // Гидратация снимка из провайдера (для реального режима — из БД).
  useEffect(() => {
    let alive = true;
    provider
      .loadSnapshot(now)
      .then((snapshot) => {
        if (alive) setState(snapshot);
      })
      .catch((e) => console.error("Не удалось загрузить данные:", e))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [provider, now]);

  /** Персистит мутацию в провайдер, не блокируя оптимистичный локальный апдейт. */
  const persist = useCallback(
    (fn: (p: DataProvider) => Promise<void>) => {
      fn(provider).catch((e) => console.error("Ошибка сохранения:", e));
    },
    [provider],
  );

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

  const addTask = useCallback<StoreValue["addTask"]>(
    (task) => {
      const newTask: DemoTask = {
        id: nextId(),
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
        expectedResult: task.expectedResult ?? null,
        completionCriterion: task.completionCriterion ?? null,
        nextAction: task.nextAction ?? null,
        recurrence: task.recurrence ?? null,
      };
      setState((s) => ({ ...s, tasks: [newTask, ...s.tasks] }));
      persist((p) => p.createTask(newTask));
      return newTask.id;
    },
    [persist],
  );

  const updateTask = useCallback<StoreValue["updateTask"]>(
    (id, patch) => {
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
      persist((p) => p.updateTask(id, patch));
    },
    [persist],
  );

  const toggleDone = useCallback<StoreValue["toggleDone"]>(
    (id) => {
      let nextStatus: TaskStatus = "done";
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) => {
          if (t.id !== id) return t;
          nextStatus = t.status === "done" ? "planned" : "done";
          return { ...t, status: nextStatus };
        }),
      }));
      persist((p) => p.updateTask(id, { status: nextStatus }));
    },
    [persist],
  );

  const setManualPriority = useCallback<StoreValue["setManualPriority"]>(
    (id, score, note) => {
      const manualPriorityNote = score === null ? null : note ?? null;
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, manualPriority: score, manualPriorityNote } : t,
        ),
      }));
      persist((p) => p.updateTask(id, { manualPriority: score, manualPriorityNote }));
    },
    [persist],
  );

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
      if (result.ok) persist((p) => p.setResultZone(resultId, zone));
      return result;
    },
    [persist],
  );

  const confirmDayPlan = useCallback(() => {
    setState((s) => ({ ...s, dayPlanConfirmed: true }));
    persist((p) => p.confirmDayPlan(now));
  }, [persist, now]);

  const setTaskStatus = useCallback<StoreValue["setTaskStatus"]>(
    (id, status) => {
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
      }));
      persist((p) => p.updateTask(id, { status }));
    },
    [persist],
  );

  const postponeTask = useCallback<StoreValue["postponeTask"]>(
    (id, toDate, reason) => {
      if (!reason.trim()) return; // причина обязательна
      let postponement: DemoState["postponements"][number] | null = null;
      setState((s) => {
        const task = s.tasks.find((t) => t.id === id);
        if (!task) return s;
        postponement = {
          id: nextId(),
          taskId: id,
          taskTitle: task.title,
          toDate,
          reason: reason.trim(),
          at: now,
        };
        return {
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, status: "postponed", dueDate: toDate } : t,
          ),
          postponements: [postponement, ...s.postponements],
        };
      });
      persist((p) => p.updateTask(id, { status: "postponed", dueDate: toDate }));
      if (postponement) persist((p) => p.addPostponement(postponement!));
    },
    [persist, now],
  );

  const splitTask = useCallback<StoreValue["splitTask"]>(
    (id, parts) => {
      const clean = parts.map((p) => p.trim()).filter(Boolean);
      if (clean.length === 0) return;
      let created: DemoTask[] = [];
      setState((s) => {
        const task = s.tasks.find((t) => t.id === id);
        if (!task) return s;
        created = clean.map((title) => ({
          ...task,
          id: nextId(),
          title,
          status: "planned",
          plannedMinutes: Math.max(5, Math.round(task.plannedMinutes / clean.length)),
        }));
        return {
          ...s,
          tasks: [
            ...created,
            ...s.tasks.map((t) => (t.id === id ? { ...t, status: "cancelled" as TaskStatus } : t)),
          ],
        };
      });
      created.forEach((t) => persist((p) => p.createTask(t)));
      persist((p) => p.updateTask(id, { status: "cancelled" }));
    },
    [persist],
  );

  const setEveningEnergy = useCallback<StoreValue["setEveningEnergy"]>(
    (v) => {
      const eveningEnergy = Math.max(1, Math.min(5, v));
      setState((s) => ({ ...s, eveningEnergy }));
      persist((p) => p.upsertCheckin(now, { eveningEnergy }));
    },
    [persist, now],
  );

  const saveEveningReview = useCallback<StoreValue["saveEveningReview"]>(
    (conclusion) => {
      setState((s) => ({ ...s, eveningConclusion: conclusion }));
      persist((p) => p.saveEveningReview(now, conclusion));
    },
    [persist, now],
  );

  const setNextWeekResults = useCallback<StoreValue["setNextWeekResults"]>(
    (titles) => {
      const next = titles.slice(0, 3);
      let decisions: DemoState["weeklyDecisions"] = [];
      setState((s) => {
        decisions = s.weeklyDecisions;
        return { ...s, nextWeekResults: next };
      });
      persist((p) => p.saveWeeklyReview(now, next, decisions));
    },
    [persist, now],
  );

  const decideResult = useCallback<StoreValue["decideResult"]>(
    (resultId, decision, reason) => {
      const zoneByDecision: Record<ResultDecision, DemoState["results"][number]["zone"] | null> = {
        continue: null,
        change: null,
        postpone: "next",
        pause: "later",
        decline: "declined",
      };
      const zone = zoneByDecision[decision];
      let nextDecisions: DemoState["weeklyDecisions"] = [];
      let nextResults: string[] = [];
      setState((s) => {
        nextDecisions = [
          ...s.weeklyDecisions.filter((d) => d.resultId !== resultId),
          { resultId, decision, reason: reason.trim() },
        ];
        nextResults = s.nextWeekResults;
        return {
          ...s,
          results: zone
            ? s.results.map((r) => (r.id === resultId ? { ...r, zone } : r))
            : s.results,
          weeklyDecisions: nextDecisions,
        };
      });
      if (zone) persist((p) => p.setResultZone(resultId, zone));
      persist((p) => p.saveWeeklyReview(now, nextResults, nextDecisions));
    },
    [persist, now],
  );

  const addDependency = useCallback<StoreValue["addDependency"]>(
    (taskId, dependsOnId) => {
      let result = { ok: true, message: "Зависимость добавлена." };
      setState((s) => {
        const edges = s.tasks.flatMap((t) =>
          t.dependsOn.map((d) => ({ taskId: t.id, dependsOnId: d })),
        );
        if (createsDependencyCycle(edges, taskId, dependsOnId)) {
          result = { ok: false, message: "Нельзя: возникнет циклическая зависимость." };
          return s;
        }
        return {
          ...s,
          tasks: s.tasks.map((t) => {
            if (t.id === taskId && !t.dependsOn.includes(dependsOnId))
              return { ...t, dependsOn: [...t.dependsOn, dependsOnId] };
            if (t.id === dependsOnId && !t.unblocks.includes(taskId))
              return { ...t, unblocks: [...t.unblocks, taskId] };
            return t;
          }),
        };
      });
      if (result.ok) persist((p) => p.addDependency(taskId, dependsOnId));
      return result;
    },
    [persist],
  );

  const removeDependency = useCallback<StoreValue["removeDependency"]>(
    (taskId, dependsOnId) => {
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) => {
          if (t.id === taskId) return { ...t, dependsOn: t.dependsOn.filter((d) => d !== dependsOnId) };
          if (t.id === dependsOnId) return { ...t, unblocks: t.unblocks.filter((u) => u !== taskId) };
          return t;
        }),
      }));
      persist((p) => p.removeDependency(taskId, dependsOnId));
    },
    [persist],
  );

  const saveOnboarding = useCallback<StoreValue["saveOnboarding"]>(
    (input) => {
      setState((s) => ({
        ...s,
        reserveRatio: input.reserveRatio,
        availableMinutes: input.availableMinutes,
        dailyMoneyLimitMajor: input.dailyMoneyLimitMajor,
      }));
      persist((p) => p.saveOnboarding(input));
    },
    [persist],
  );

  const setMorningEnergy = useCallback(
    (v: number) => {
      const morningEnergy = Math.max(1, Math.min(5, v));
      setState((s) => ({ ...s, morningEnergy }));
      persist((p) => p.upsertCheckin(now, { morningEnergy }));
    },
    [persist, now],
  );

  const setAvailableMinutes = useCallback(
    (v: number) => {
      const availableMinutes = Math.max(0, v);
      setState((s) => ({ ...s, availableMinutes }));
      persist((p) => p.upsertCheckin(now, { availableMinutes }));
    },
    [persist, now],
  );

  const value: StoreValue = {
    state,
    now,
    mode: provider.mode,
    loading,
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
    saveOnboarding,
    addDependency,
    removeDependency,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore должен использоваться внутри DemoStoreProvider");
  return ctx;
}
