import type { FocusZone } from "@/domain/focus";
import type { DomainTask } from "@/domain/types";

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
}

export interface DemoEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  fixed: boolean;
  blocksAvailability: boolean;
}

export interface DemoState {
  lifeAreas: DemoLifeArea[];
  results: DemoResult[];
  tasks: DemoTask[];
  events: DemoEvent[];
  dayPlanConfirmed: boolean;
  morningEnergy: number; // 1..5
  availableMinutes: number;
  reserveRatio: number;
  dailyMoneyLimitMajor: number | null;
}
