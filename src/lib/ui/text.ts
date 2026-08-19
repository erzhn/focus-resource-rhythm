/** Небольшие чистые помощники интерфейса (тестируются без DOM). */

/** Приветствие по времени суток. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

/** Совпадение по подстроке без учёта регистра (для командного меню и поиска). */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

/** Циклический сдвиг индекса выбора в списке (для клавиатурной навигации). */
export function cycleIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
}

/** Русское склонение по числу: plural(2, "результат", "результата", "результатов"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
