/**
 * Финансовый день.
 *
 * Сутки учёта начинаются не в полночь, а в 01:00 по времени Кыргызстана:
 * покупка в 00:30 относится ещё к прошедшему дню — так привычнее, когда день
 * заканчивается поздно ночью.
 *
 * Кыргызстан — UTC+6 круглый год (перевод часов отменён в 2005-м), поэтому
 * используем фиксированное смещение: оно детерминировано и не зависит от
 * наличия tzdata в окружении.
 */

/** Час начала финансового дня по местному времени. */
export const DAY_START_HOUR = 1;
/** Смещение Asia/Bishkek от UTC в минутах. */
export const TZ_OFFSET_MINUTES = 6 * 60;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** Ярлык финансового дня — «2026-09-16». Сравнивается и сортируется как строка. */
export type FinancialDay = string;

const pad = (n: number) => String(n).padStart(2, "0");

/** Местное время как «сдвинутый UTC»: удобно читать через getUTC*-методы. */
function toLocal(instant: Date, offsetMinutes: number): Date {
  return new Date(instant.getTime() + offsetMinutes * MS_PER_MINUTE);
}

/** К какому финансовому дню относится момент времени. */
export function financialDayOf(
  instant: Date,
  offsetMinutes: number = TZ_OFFSET_MINUTES,
): FinancialDay {
  const local = toLocal(instant, offsetMinutes);
  // До часа ночи день ещё не сменился — относим к предыдущему.
  const shifted =
    local.getUTCHours() < DAY_START_HOUR ? new Date(local.getTime() - MS_PER_DAY) : local;
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Границы финансового дня в абсолютном времени: [начало, конец). */
export function financialDayRange(
  day: FinancialDay,
  offsetMinutes: number = TZ_OFFSET_MINUTES,
): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const localStart = Date.UTC(y, m - 1, d, DAY_START_HOUR, 0, 0, 0);
  const start = new Date(localStart - offsetMinutes * MS_PER_MINUTE);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
}

/** Сдвиг ярлыка на N дней: shiftFinancialDay("2026-09-16", -1) → "2026-09-15". */
export function shiftFinancialDay(day: FinancialDay, deltaDays: number): FinancialDay {
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + deltaDays * MS_PER_DAY;
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Человеческая подпись дня: «16 сентября». */
export function formatFinancialDay(day: FinancialDay): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS_GENITIVE[m - 1]}`;
}

/** Календарный месяц финансового дня — «2026-09». */
export function monthOf(day: FinancialDay): string {
  return day.slice(0, 7);
}

/** Последние N финансовых дней, начиная с указанного (включительно), от старых к новым. */
export function lastFinancialDays(today: FinancialDay, count: number): FinancialDay[] {
  return Array.from({ length: count }, (_, i) => shiftFinancialDay(today, i - (count - 1)));
}
