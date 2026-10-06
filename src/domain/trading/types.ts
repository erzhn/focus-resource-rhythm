import type { Decimal } from "./decimal";

/**
 * Типы торгового учёта.
 *
 * Главный принцип, пронизывающий весь модуль: неизвестное остаётся
 * неизвестным. Поэтому вместо «0 по умолчанию» используется Maybe с причиной —
 * тогда экран может честно написать, ПОЧЕМУ значения нет, а статистика не
 * получит выдуманный ноль, искажающий средние.
 */

export interface Known<T> {
  known: true;
  value: T;
}
export interface Unknown {
  known: false;
  reason: string;
}
export type Maybe<T> = Known<T> | Unknown;

// Конструкторы возвращают узкий тип, иначе `.value` пришлось бы каждый раз
// заново проверять сразу после создания.
export const known = <T>(value: T): Known<T> => ({ known: true, value });
export const unknown = (reason: string): Unknown => ({ known: false, reason });

/** Направление сделки. */
export type Direction = "long" | "short";

/** Знак направления: +1 для long, −1 для short. */
export const directionSign = (d: Direction): Decimal =>
  d === "long" ? { value: 1n, scale: 0 } : { value: -1n, scale: 0 };

/**
 * Расчётная модель инструмента.
 *
 * Поддержана только линейная: «изменение цены × объём × множитель». Опционы и
 * инверсные контракты считаются иначе, и подставлять их в эту формулу нельзя —
 * получится правдоподобное, но неверное число.
 */
export type CalcModel = "linear" | "unsupported";

/** Единица объёма — она же подпись поля ввода. */
export type VolumeUnit = "lot" | "share" | "coin" | "contract";

export const VOLUME_UNIT_LABELS: Record<VolumeUnit, string> = {
  lot: "Лоты",
  share: "Штуки",
  coin: "Монеты",
  contract: "Контракты",
};

/**
 * Спецификация инструмента на конкретном счёте, в конкретной версии.
 *
 * Хранится снимком в сделке: смена настроек брокера не должна задним числом
 * менять P/L и риск закрытых сделок.
 */
export interface InstrumentSpec {
  /** Версия спецификации — попадает в снимок сделки. */
  version: number;
  model: CalcModel;
  volumeUnit: VolumeUnit;
  /** Множитель C: переводит «изменение цены × объём» в валюту котировки. */
  contractMultiplier: Decimal;
  quoteCurrency: string;
  minVolume: Decimal;
  volumeStep: Decimal;
  maxVolume: Decimal | null;
  /** Минимальный объём одного частичного закрытия. */
  minCloseVolume: Decimal;
  /** Минимальный остаток после частичного закрытия. */
  minRemainingVolume: Decimal;
  priceStep: Decimal;
}

/**
 * Курс пересчёта в валюту счёта: сколько единиц валюты счёта за одну единицу
 * исходной валюты. Снимок на момент события — история не пересчитывается по
 * сегодняшнему курсу.
 */
export interface FxSnapshot {
  rate: Decimal;
  at: Date;
  source: "manual" | "imported" | "market_data";
  /** Оценка, а не зафиксированный курс сделки. */
  estimated: boolean;
}

/** Факт входа: то, что произошло, а не то, что планировалось. */
export interface TradeEntry {
  direction: Direction;
  entryPrice: Decimal;
  /** Исходный стоп. null — сделка записана задним числом без стопа. */
  initialStop: Decimal | null;
  target: Decimal | null;
  quantity: Decimal;
  spec: InstrumentSpec;
  /** Курс валюты котировки к валюте счёта на момент входа. */
  fxAtEntry: FxSnapshot | null;
  /** Баланс непосредственно перед входом. null — достоверно неизвестен. */
  balanceAtEntry: Decimal | null;
}

/** Частичный или финальный выход. */
export interface TradeExit {
  quantity: Decimal;
  price: Decimal;
  at: Date;
  fx: FxSnapshot | null;
}

/**
 * Денежная проводка, не являющаяся результатом движения цены: комиссия, своп,
 * funding. Сумма ПОДПИСАННАЯ и уже в валюте счёта: комиссия отрицательна,
 * своп может быть любого знака. Повторно вычитать ничего не нужно.
 */
export interface CashAdjustment {
  amountAccount: Decimal;
  kind: "commission" | "swap" | "funding" | "other";
  at: Date;
}

/** Ценовые экстремумы за время сделки. */
export interface PriceExcursion {
  mfePrice: Decimal | null;
  maePrice: Decimal | null;
  source: "manual" | "imported" | "market_data";
  estimated: boolean;
}

/** Масштабы расчётов. Заданы один раз, чтобы числа сходились между экранами. */
export const SCALE = {
  /** Денежные величины внутри расчёта. */
  money: 8,
  /** R — безразмерная величина, но нужна точность для сравнения. */
  r: 10,
  /** Проценты. */
  pct: 6,
  /** Курсы валют. */
  fx: 12,
} as const;
