import type { CategoryId } from "./categories";
import { monthOf, type FinancialDay } from "./day";

/**
 * Регулярные обязательные расходы: аренда, подписки, интернет.
 *
 * Они известны заранее, поэтому «свободно на сегодня» можно считать честно —
 * с учётом того, что ещё предстоит заплатить в этом месяце.
 */

export interface RecurringExpense {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  category: CategoryId;
  /** День месяца списания, 1–31. Если в месяце меньше дней — переносится на последний. */
  dayOfMonth: number;
  active: boolean;
}

/** Фактический день списания в конкретном месяце (28-е февраля вместо 31-го). */
export function dueDayInMonth(dayOfMonth: number, year: number, month1: number): number {
  const daysInMonth = new Date(year, month1, 0).getDate();
  return Math.min(dayOfMonth, daysInMonth);
}

/** Финансовый день списания для месяца вида «2026-09». */
export function dueFinancialDay(item: RecurringExpense, month: string): FinancialDay {
  const [y, m] = month.split("-").map(Number);
  const d = dueDayInMonth(item.dayOfMonth, y, m);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface UpcomingSummary {
  /** Ещё не наступившие списания этого месяца. */
  upcoming: { item: RecurringExpense; day: FinancialDay }[];
  /** Их сумма в основной валюте. */
  totalMinor: number;
}

/**
 * Что ещё предстоит заплатить в этом месяце после указанного дня.
 * Списания в тот же день считаются предстоящими: платёж мог ещё не пройти.
 */
export function upcomingThisMonth(
  items: RecurringExpense[],
  today: FinancialDay,
  mainCurrency = "KGS",
): UpcomingSummary {
  const month = monthOf(today);
  const upcoming = items
    .filter((i) => i.active)
    .map((item) => ({ item, day: dueFinancialDay(item, month) }))
    .filter(({ day }) => day >= today)
    .sort((a, b) => a.day.localeCompare(b.day));

  const totalMinor = upcoming
    .filter(({ item }) => item.currency === mainCurrency)
    .reduce((s, { item }) => s + item.amountMinor, 0);

  return { upcoming, totalMinor };
}

/** Суммарные обязательства за месяц — независимо от того, прошли они или нет. */
export function monthlyCommitmentMinor(
  items: RecurringExpense[],
  mainCurrency = "KGS",
): number {
  return items
    .filter((i) => i.active && i.currency === mainCurrency)
    .reduce((s, i) => s + i.amountMinor, 0);
}
