/**
 * Локальная дата торгового счёта.
 *
 * В личных финансах этого проекта день считается по фиксированному смещению
 * UTC+6 — осознанное решение для страны без перехода на летнее время. Для
 * торговли так нельзя: счёт может быть в любой зоне, а правила «не больше трёх
 * входов в день» и границы дневника обязаны совпадать с календарём владельца.
 * Поэтому здесь работает сохранённая IANA-зона и настоящие правила перехода.
 */

/** Ярлык дня — «2026-09-29». Сравнивается и сортируется как строка. */
export type LocalDate = string;

const pad = (n: number) => String(n).padStart(2, "0");

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Часовой пояс существует и понятен среде выполнения. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function partsIn(instant: Date, timeZone: string): Parts {
  const map: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // В некоторых средах полночь приходит как «24» — приводим к нулю.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Локальная дата момента: «2026-09-29». */
export function localDate(instant: Date, timeZone: string): LocalDate {
  const p = partsIn(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Локальное время момента: «00:30». */
export function localTime(instant: Date, timeZone: string): string {
  const p = partsIn(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Смещение зоны в минутах для конкретного момента (учитывает переходы). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Секунды момента отбрасываем до целой секунды: formatToParts их не дробит.
  return Math.round((asIfUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * Абсолютный момент локальной полуночи указанной даты.
 *
 * Смещение зависит от самой даты (переход на летнее время), поэтому считаем
 * в два прохода: первый даёт приближение, второй уточняет его уже в нужной
 * точке года.
 */
function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
  const firstGuess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
  return new Date(naive - offsetMinutes(firstGuess, timeZone) * 60_000);
}

/** Границы локальных суток в абсолютном времени: [начало, конец). */
export function dayRange(date: LocalDate, timeZone: string): { start: Date; end: Date } {
  return {
    start: startOfLocalDay(date, timeZone),
    end: startOfLocalDay(shiftDate(date, 1), timeZone),
  };
}

/** Сдвиг ярлыка даты на N дней. */
export function shiftDate(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

/** Календарный месяц даты — «2026-09». */
export const monthOf = (date: LocalDate): string => date.slice(0, 7);

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Человеческая подпись даты: «29 сентября». */
export function formatLocalDate(date: LocalDate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_GENITIVE[m - 1]}`;
}
