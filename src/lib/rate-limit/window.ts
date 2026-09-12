/**
 * Чистая арифметика окна лимита (тестируется без БД).
 *
 * Модель — фиксированное окно: при первом запросе запоминается его начало,
 * счётчик растёт до конца окна, затем всё обнуляется. Проще скользящего окна
 * и достаточно для защиты от перебора и злоупотребления.
 */

export interface WindowState {
  windowStart: number;
  count: number;
}

export interface Decision {
  allowed: boolean;
  remaining: number;
  /** Через сколько миллисекунд окно сбросится. */
  resetInMs: number;
  next: WindowState;
}

export function consume(
  prev: WindowState | null,
  now: number,
  limit: number,
  windowMs: number,
): Decision {
  const expired = !prev || now - prev.windowStart >= windowMs;
  const next: WindowState = expired
    ? { windowStart: now, count: 1 }
    : { windowStart: prev.windowStart, count: prev.count + 1 };

  return {
    allowed: next.count <= limit,
    remaining: Math.max(0, limit - next.count),
    resetInMs: Math.max(0, next.windowStart + windowMs - now),
    next,
  };
}

/** Ключ лимита: группа + субъект. Субъект нормализуем, чтобы не плодить записи. */
export function limitKey(scope: string, subject: string): string {
  return `${scope}:${subject.trim().toLowerCase().slice(0, 120)}`;
}
