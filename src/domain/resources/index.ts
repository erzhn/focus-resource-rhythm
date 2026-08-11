import { METHOD } from "@/config/app";
import type { EnergyBand, Scale1to5 } from "@/domain/types";

/** Приводит долю резерва к допустимому диапазону 20–30%. */
export function clampReserveRatio(ratio: number): number {
  return Math.max(METHOD.minTimeReserveRatio, Math.min(METHOD.maxTimeReserveRatio, ratio));
}

/** Минуты резерва при заданном доступном времени и доле резерва. */
export function reserveMinutes(availableMinutes: number, reserveRatio: number): number {
  return Math.round(availableMinutes * clampReserveRatio(reserveRatio));
}

/** Плановое рабочее время после вычета резерва. */
export function plannableMinutes(availableMinutes: number, reserveRatio: number): number {
  return availableMinutes - reserveMinutes(availableMinutes, reserveRatio);
}

/** Уровень сил 1–5 → упрощённая полоса для интерфейса. */
export function energyBand(level: Scale1to5): EnergyBand {
  if (level <= 2) return "low";
  if (level === 3) return "medium";
  return "high";
}

export const ENERGY_BAND_LABELS: Record<EnergyBand, string> = {
  low: "низкие",
  medium: "средние",
  high: "высокие",
};

export interface ResourceBudget {
  planned: number;
  actual: number;
  limit: number | null;
}

export interface LimitCheck {
  exceeded: boolean;
  /** Почти исчерпан (>= 90% лимита), но ещё не превышен. */
  nearLimit: boolean;
  remaining: number | null;
  message: string | null;
}

/**
 * Проверяет план против лимита. Возвращает предупреждение до подтверждения,
 * но никогда не блокирует — пользователь может подтвердить сознательно.
 */
export function checkLimit(planned: number, limit: number | null, unit: string): LimitCheck {
  if (limit === null) {
    return { exceeded: false, nearLimit: false, remaining: null, message: null };
  }
  const remaining = limit - planned;
  if (planned > limit) {
    return {
      exceeded: true,
      nearLimit: false,
      remaining,
      message: `План превышает лимит на ${planned - limit} ${unit}. Можно продолжить, но подтвердите решение.`,
    };
  }
  const nearLimit = planned >= limit * 0.9;
  return {
    exceeded: false,
    nearLimit,
    remaining,
    message: nearLimit ? `Лимит почти исчерпан: осталось ${remaining} ${unit}.` : null,
  };
}
