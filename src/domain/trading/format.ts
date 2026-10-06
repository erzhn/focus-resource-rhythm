/**
 * Отображение торговых величин.
 *
 * Все функции принимают СТРОКИ и работают со строками. Через Number() здесь
 * ничего не проходит: именно там теряется точность, ради сохранения которой
 * написана десятичная арифметика.
 *
 * Неизвестное значение (null) печатается как «—», а не как ноль: пустая
 * клетка честнее нуля, который выглядит измеренным.
 */

import { VOLUME_UNIT_LABELS, type VolumeUnit } from "./types";

/** Прочерк для неизвестных значений — один на весь модуль. */
export const DASH = "—";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  RUB: "₽",
  KGS: "сом",
  KZT: "₸",
  JPY: "¥",
  USDT: "USDT",
};

export const currencyLabel = (currency: string) =>
  CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();

interface SplitNumber {
  negative: boolean;
  whole: string;
  fraction: string;
}

function split(value: string): SplitNumber | null {
  const raw = value.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(raw)) return null;
  const negative = raw.startsWith("-") && /[1-9]/.test(raw);
  const [whole, fraction = ""] = raw.replace(/^[+-]/, "").split(".");
  return { negative, whole, fraction };
}

/** Разряды разделяются узким неразрывным пробелом — как в остальном проекте. */
function groupDigits(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Обрезает дробную часть до нужного числа знаков БЕЗ округления вверх.
 *
 * Для показа это правильнее: округлённый вверх убыток выглядел бы меньше, чем
 * он есть. Точное значение всегда остаётся в базе.
 */
function cutFraction(fraction: string, maxDigits: number): string {
  return fraction.slice(0, maxDigits).replace(/0+$/, "");
}

export interface MoneyOptions {
  /** Максимум знаков после запятой; по умолчанию 2. */
  maxFraction?: number;
  /** Показывать знак «+» у положительных — для результата сделки. */
  signed?: boolean;
}

/** «1234.5», USD → «1 234.5 $». */
export function formatMoney(
  value: string | null | undefined,
  currency: string,
  options: MoneyOptions = {},
): string {
  if (value === null || value === undefined) return DASH;
  const parts = split(value);
  if (!parts) return DASH;

  const { maxFraction = 2, signed = false } = options;
  const fraction = cutFraction(parts.fraction, maxFraction);
  const body = `${groupDigits(parts.whole)}${fraction ? `.${fraction}` : ""}`;
  const sign = parts.negative ? "−" : signed ? "+" : "";
  const symbol = currencyLabel(currency);

  // Символы ставим слева слитно, словесные обозначения — справа.
  return symbol.length === 1
    ? `${sign}${symbol}${body}`
    : `${sign}${body} ${symbol}`;
}

/** «2.7777777778» → «2.78R». Знак сохраняется. */
export function formatR(value: string | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return DASH;
  const parts = split(value);
  if (!parts) return DASH;
  const fraction = parts.fraction.slice(0, digits);
  const body = `${groupDigits(parts.whole)}${fraction ? `.${fraction}` : ""}`;
  return `${parts.negative ? "−" : ""}${body}R`;
}

/** «25.714286» → «25.71 %». */
export function formatPercent(value: string | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return DASH;
  const parts = split(value);
  if (!parts) return DASH;
  const fraction = cutFraction(parts.fraction, digits);
  const body = `${groupDigits(parts.whole)}${fraction ? `.${fraction}` : ""}`;
  return `${parts.negative ? "−" : ""}${body} %`;
}

/**
 * Объём с подписью единицы.
 *
 * Единица обязательна: 0.01 лота золота, 10 акций и 0.1 BTC — величины
 * разной природы, и показывать их одним безликим числом нельзя.
 */
export function formatQuantity(
  value: string | null | undefined,
  unit: VolumeUnit,
  maxFraction = 8,
): string {
  if (value === null || value === undefined) return DASH;
  const parts = split(value);
  if (!parts) return DASH;
  const fraction = cutFraction(parts.fraction, maxFraction);
  const body = `${groupDigits(parts.whole)}${fraction ? `.${fraction}` : ""}`;
  return `${body} ${VOLUME_UNIT_LABELS[unit].toLowerCase()}`;
}

/** Цена: знаков столько, сколько записано, но не больше восьми. */
export function formatPrice(value: string | null | undefined, maxFraction = 8): string {
  if (value === null || value === undefined) return DASH;
  const parts = split(value);
  if (!parts) return DASH;
  const fraction = cutFraction(parts.fraction, maxFraction);
  return `${parts.negative ? "−" : ""}${groupDigits(parts.whole)}${fraction ? `.${fraction}` : ""}`;
}

/** Знак величины для выбора цвета: положительная, отрицательная или нулевая. */
export function signOf(value: string | null | undefined): "positive" | "negative" | "zero" | "unknown" {
  if (value === null || value === undefined) return "unknown";
  const parts = split(value);
  if (!parts) return "unknown";
  if (!/[1-9]/.test(parts.whole + parts.fraction)) return "zero";
  return parts.negative ? "negative" : "positive";
}

export const DIRECTION_LABELS = { long: "Покупка", short: "Продажа" } as const;

export const ENTRY_MODE_LABELS = {
  planned: "по плану",
  historical: "задним числом",
  imported: "импорт",
} as const;
