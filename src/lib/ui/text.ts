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
