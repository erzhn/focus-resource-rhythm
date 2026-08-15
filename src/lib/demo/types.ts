import type { FocusZone } from "@/domain/focus";
import type { DomainTask } from "@/domain/types";
import type { RecurrenceRule } from "@/domain/recurrence";

/** Сфера жизни (демо). */
export interface DemoLifeArea {
  id: string;
  name: string;
  color: string;
}

/** Крупный результат: цель или проект (демо). */
export interface DemoResult {
  id: string;
  title: string;
  kind: "goal" | "project";
  lifeAreaId: string | null;
  zone: FocusZone;
  horizonDays: number | null;
  progress: number; // 0..1
}

/** Задача в демо-хранилище = доменная задача + UI-поля. */
export interface DemoTask extends DomainTask {
  description: string | null;
  resultId: string | null;
  manualPriority: number | null;
  manualPriorityNote: string | null;
  expectedResult: string | null;
  completionCriterion: string | null;
  nextAction: string | null;
  /** Правило повторения (null — разовая задача). */
  recurrence: RecurrenceRule | null;
}

export interface DemoEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  fixed: boolean;
  blocksAvailability: boolean;
}

/** Перенос задачи с обязательной причиной. */
export interface DemoPostponement {
  id: string;
  taskId: string;
  taskTitle: string;
  toDate: Date;
  reason: string;
  at: Date;
}

/** Решение по крупному результату на еженедельной сверке. */
export type ResultDecision = "continue" | "change" | "postpone" | "pause" | "decline";

export interface DemoState {
  lifeAreas: DemoLifeArea[];
  results: DemoResult[];
  tasks: DemoTask[];
  events: DemoEvent[];
  dayPlanConfirmed: boolean;
  morningEnergy: number; // 1..5
  eveningEnergy: number | null; // 1..5, отметка вечером
  availableMinutes: number;
  reserveRatio: number;
  dailyMoneyLimitMajor: number | null;
  postponements: DemoPostponement[];
  /** Сохранённый вывод вечернего итога за сегодня. */
  eveningConclusion: string | null;
  /** До трёх ключевых результатов следующей недели. */
  nextWeekResults: string[];
  /** Сохранённые решения недельной сверки по результатам. */
  weeklyDecisions: { resultId: string; decision: ResultDecision; reason: string }[];
}
