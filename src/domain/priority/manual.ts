import type { PriorityResult } from "./score";

/** Ручное изменение приоритета хранится отдельно от системной рекомендации. */
export interface ManualPriorityOverride {
  /** Балл 0–100, назначенный пользователем вручную. */
  score: number;
  /** Причина/комментарий (необязательно). */
  note: string | null;
  /** Момент изменения. */
  at: Date;
}

export interface EffectivePriority {
  /** Итоговый балл, по которому сортируется список. */
  effectiveScore: number;
  /** Системная рекомендация (всегда доступна для сравнения). */
  system: PriorityResult;
  /** Ручное значение, если задано. */
  manual: ManualPriorityOverride | null;
  /** Признак того, что действует ручное решение. */
  isManual: boolean;
}

/**
 * Возвращает эффективный приоритет: если пользователь задал ручное значение,
 * оно имеет приоритет, но системная рекомендация сохраняется для сравнения.
 */
export function resolvePriority(
  system: PriorityResult,
  manual: ManualPriorityOverride | null,
): EffectivePriority {
  return {
    effectiveScore: manual ? manual.score : system.score,
    system,
    manual,
    isManual: manual !== null,
  };
}
