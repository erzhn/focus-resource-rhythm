import type { FocusZone } from "@/domain/focus";
import type { DemoEvent, DemoPostponement, DemoState, DemoTask, ResultDecision, DemoTransaction } from "@/lib/demo/types";
import type { RecurringExpense } from "@/domain/finance/recurring";
import type { CategoryId } from "@/domain/finance/categories";

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
  createEvent(event: DemoEvent): Promise<void>;
  updateEvent(id: string, patch: Partial<Omit<DemoEvent, "id">>): Promise<void>;
  deleteEvent(id: string): Promise<void>;

  upsertCheckin(
    date: Date,
    patch: { morningEnergy?: number; eveningEnergy?: number; availableMinutes?: number },
  ): Promise<void>;
  confirmDayPlan(date: Date): Promise<void>;
  addPostponement(p: DemoPostponement): Promise<void>;
  saveEveningReview(date: Date, conclusion: string): Promise<void>;
  /** Операции учёта денег. */
  addTransaction(tx: DemoTransaction): Promise<void>;
  updateTransaction(id: string, patch: Partial<Omit<DemoTransaction, "id">>): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  /** Начальный баланс и бюджеты. Поля необязательные — задаются по мере надобности. */
  saveFinanceSettings(patch: {
    openingBalanceMinor?: number | null;
    dailyBudgetMinor?: number | null;
    monthlyBudgetMinor?: number | null;
  }): Promise<void>;

  /** Регулярные платежи. */
  addRecurring(item: RecurringExpense): Promise<void>;
  updateRecurring(id: string, patch: Partial<Omit<RecurringExpense, "id">>): Promise<void>;
  deleteRecurring(id: string): Promise<void>;
  /** Сопоставление категории со сферой жизни; null — убрать сопоставление. */
  setCategoryArea(category: CategoryId, areaId: string | null): Promise<void>;

  saveWeeklyReview(
    weekStart: Date,
    nextWeekResults: string[],
    decisions: { resultId: string; decision: ResultDecision; reason: string }[],
  ): Promise<void>;
}
