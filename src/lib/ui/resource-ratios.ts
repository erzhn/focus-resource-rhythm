/** Чистый расчёт долей ресурсов для индикаторов (время / деньги / силы). */

export interface Ratio {
  /** Доля 0..1 (для колец и шкал, ограничена сверху 1). */
  ratio: number;
  /** Сырое отношение план/лимит (может быть > 1 при перерасходе). */
  raw: number;
  /** Превышен ли лимит. */
  over: boolean;
}

function ratio(value: number, limit: number): Ratio {
  if (limit <= 0) return { ratio: 0, raw: 0, over: false };
  const raw = value / limit;
  return { ratio: Math.max(0, Math.min(1, raw)), raw, over: raw > 1 };
}

export interface ResourceRatios {
  time: Ratio;
  money: Ratio | null;
  /** Силы как доля от 5. */
  energy: Ratio;
}

export function resourceRatios(input: {
  plannedMinutes: number;
  plannableMinutes: number;
  plannedMoney: number;
  moneyLimit: number | null;
  energy: number;
}): ResourceRatios {
  return {
    time: ratio(input.plannedMinutes, input.plannableMinutes),
    money: input.moneyLimit === null ? null : ratio(input.plannedMoney, input.moneyLimit),
    energy: ratio(input.energy, 5),
  };
}
