import {
  addDays,
  differenceInCalendarDays,
  format,
  getDate,
  getDay,
  lastDayOfMonth,
  startOfDay,
} from "date-fns";

/** Тип повторения. */
export type RecurrenceFrequency =
  | "daily" // ежедневно
  | "weekly" // еженедельно / по выбранным дням недели
  | "monthly_date" // ежемесячно по дате
  | "monthly_rule" // ежемесячно по правилу (например, «последняя пятница»)
  | "interval"; // произвольный интервал (каждые N дней)

/** Порядковый номер в месяце для правила «N-я пятница» / «последняя пятница». */
export type MonthlyOrdinal = 1 | 2 | 3 | 4 | "last";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Дата начала серии (в часовом поясе пользователя). */
  startDate: Date;
  /** Необязательная дата окончания. null — без ограничения. */
  endDate?: Date | null;
  /** Интервал в днях для frequency = "interval". */
  intervalDays?: number;
  /** Дни недели 0–6 (вс–сб) для frequency = "weekly". Пусто — берётся день недели старта. */
  weekdays?: number[];
  /** День месяца 1–31 для frequency = "monthly_date". */
  monthDay?: number;
  /** Правило для frequency = "monthly_rule". */
  monthlyOrdinal?: MonthlyOrdinal;
  monthlyWeekday?: number; // 0–6
}

/** Максимальная ширина окна генерации (защита от бесконечных серий). */
const MAX_WINDOW_DAYS = 366 * 2;

const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

/** Дата N-го (или последнего) вхождения дня недели в месяце. null — если N-го нет. */
export function nthWeekdayOfMonth(
  year: number,
  month0: number,
  weekday: number,
  ordinal: MonthlyOrdinal,
): Date | null {
  if (ordinal === "last") {
    let d = lastDayOfMonth(new Date(year, month0, 1));
    while (getDay(d) !== weekday) d = addDays(d, -1);
    return startOfDay(d);
  }
  let d = new Date(year, month0, 1);
  while (getDay(d) !== weekday) d = addDays(d, 1);
  d = addDays(d, (ordinal - 1) * 7);
  return d.getMonth() === month0 ? startOfDay(d) : null;
}

/** Проверяет, попадает ли конкретный день под правило (без учёта границ/исключений). */
function matchesRule(rule: RecurrenceRule, day: Date, start: Date): boolean {
  switch (rule.frequency) {
    case "daily":
      return true;
    case "interval": {
      const n = Math.max(1, rule.intervalDays ?? 1);
      return differenceInCalendarDays(day, start) % n === 0;
    }
    case "weekly": {
      const days = rule.weekdays?.length ? rule.weekdays : [getDay(start)];
      return days.includes(getDay(day));
    }
    case "monthly_date":
      return getDate(day) === (rule.monthDay ?? getDate(start));
    case "monthly_rule": {
      if (rule.monthlyWeekday === undefined || rule.monthlyOrdinal === undefined) return false;
      const target = nthWeekdayOfMonth(
        day.getFullYear(),
        day.getMonth(),
        rule.monthlyWeekday,
        rule.monthlyOrdinal,
      );
      return target !== null && isoDay(target) === isoDay(day);
    }
  }
}

/**
 * Разворачивает правило повторения в ограниченный список дат внутри окна.
 * Не создаёт бесконечных записей; исключения (перенесённые/отменённые экземпляры) пропускаются.
 *
 * @param exceptions множество дат ISO (yyyy-MM-dd), которые исключены из серии.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  windowStart: Date,
  windowEnd: Date,
  exceptions: ReadonlySet<string> = new Set(),
): Date[] {
  const start = startOfDay(rule.startDate);
  const from = startOfDay(windowStart > start ? windowStart : start);
  let to = startOfDay(windowEnd);
  if (rule.endDate) {
    const end = startOfDay(rule.endDate);
    if (end < to) to = end;
  }
  if (to < from) return [];
  // Ограничиваем окно, чтобы генерация всегда завершалась.
  const spanDays = Math.min(differenceInCalendarDays(to, from), MAX_WINDOW_DAYS);

  const result: Date[] = [];
  for (let i = 0; i <= spanDays; i++) {
    const day = addDays(from, i);
    if (matchesRule(rule, day, start) && !exceptions.has(isoDay(day))) {
      result.push(day);
    }
  }
  return result;
}
