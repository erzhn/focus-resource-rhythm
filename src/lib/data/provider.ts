import type { FocusZone } from "@/domain/focus";
import type { DemoPostponement, DemoState, DemoTask, ResultDecision } from "@/lib/demo/types";

/**
 * Абстракция источника данных. Экраны через стор работают с провайдером, не зная,
 * это память (демо-режим) или Supabase (реальное хранение с RLS).
 *
 * Стор остаётся реактивным клиентским кэшем и считает доменную логику; провайдер
 * отвечает за загрузку снимка и запись мутаций. Мутации применяются оптимистично
 * локально, а провайдер персистит их (в демо — no-op).
 */
/** Данные первичной настройки (онбординга). */
export interface OnboardingInput {
  timezone: string;
  currency: string;
  availableMinutes: number;
  reserveRatio: number;
  dailyMoneyLimitMajor: number | null;
  workStart: string; // HH:mm
  workEnd: string;
  morningRitualAt: string;
  eveningRitualAt: string;
}

export interface DataProvider {
  readonly mode: "demo" | "supabase";

  /** Загружает полный снимок состояния пользователя. */
  loadSnapshot(now: Date): Promise<DemoState>;

  /** Сохраняет настройки и отмечает завершённый онбординг. */
  saveOnboarding(input: OnboardingInput): Promise<void>;

  createTask(task: DemoTask): Promise<void>;
  updateTask(id: string, patch: Partial<DemoTask>): Promise<void>;
  setResultZone(resultId: string, zone: FocusZone): Promise<void>;
  addDependency(taskId: string, dependsOnId: string): Promise<void>;
  removeDependency(taskId: string, dependsOnId: string): Promise<void>;

  upsertCheckin(
    date: Date,
    patch: { morningEnergy?: number; eveningEnergy?: number; availableMinutes?: number },
  ): Promise<void>;
  confirmDayPlan(date: Date): Promise<void>;
  addPostponement(p: DemoPostponement): Promise<void>;
  saveEveningReview(date: Date, conclusion: string): Promise<void>;
  saveWeeklyReview(
    weekStart: Date,
    nextWeekResults: string[],
    decisions: { resultId: string; decision: ResultDecision; reason: string }[],
  ): Promise<void>;
}
