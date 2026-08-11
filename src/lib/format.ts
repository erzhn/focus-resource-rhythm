import { format } from "date-fns";
import { REGIONAL_DEFAULTS } from "@/config/app";

/** Дата в формате дд.мм.гггг. */
export function formatDate(d: Date): string {
  return format(d, "dd.MM.yyyy");
}

/** Время в 24-часовом формате. */
export function formatTime(d: Date): string {
  return format(d, "HH:mm");
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${formatTime(d)}`;
}

/** Минуты → «Ч ч М мин». */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Деньги (в основной валюте) с символом валюты. */
export function formatMoney(amount: number, currency = REGIONAL_DEFAULTS.currency): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Минорные единицы (тыйын) → основная валюта. */
export const minorToMajor = (minor: number) => minor / 100;
