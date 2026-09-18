import { formatMinor } from "@/domain/finance/format";
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
  // Делегируем в общий форматтер учёта денег: раньше Intl со style:"currency"
  // печатал ISO-код («2 380 KGS»), а раздел «Деньги» — «2 380 сом». Одна и та же
  // сумма выглядела по-разному на соседних экранах.
  return formatMinor(Math.round(amount * 100), currency);
}

/** Минорные единицы (тыйын) → основная валюта. */
export const minorToMajor = (minor: number) => minor / 100;
