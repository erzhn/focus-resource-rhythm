import type { CategoryId } from "./categories";

/**
 * Автокатегория по истории.
 *
 * Встроенный словарь ключевых слов не знает про «Глобус» или «У Айгуль».
 * Поэтому если пользователь уже относил такую покупку к категории, в следующий
 * раз подставляем её же — система учится на его решениях, а не на моём списке.
 *
 * Берём самую частую категорию для описания; при равенстве — более свежую.
 */

interface Seen {
  category: CategoryId;
  description: string;
  occurredAt: Date;
}

export type LearnedCategories = Map<string, CategoryId>;

/** Ключ описания: регистр, ё и лишние пробелы не должны мешать совпадению. */
export function descriptionKey(description: string): string {
  return description.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Строит словарь «описание → категория» из прошлых расходов. */
export function learnCategories(history: Seen[]): LearnedCategories {
  // описание → категория → { count, last }
  const tally = new Map<string, Map<CategoryId, { count: number; last: number }>>();

  for (const t of history) {
    const key = descriptionKey(t.description);
    if (!key) continue;
    const byCat = tally.get(key) ?? new Map();
    const prev = byCat.get(t.category) ?? { count: 0, last: 0 };
    byCat.set(t.category, {
      count: prev.count + 1,
      last: Math.max(prev.last, t.occurredAt.getTime()),
    });
    tally.set(key, byCat);
  }

  const learned: LearnedCategories = new Map();
  for (const [key, byCat] of tally) {
    let best: { category: CategoryId; count: number; last: number } | null = null;
    for (const [category, v] of byCat) {
      if (!best || v.count > best.count || (v.count === best.count && v.last > best.last)) {
        best = { category, count: v.count, last: v.last };
      }
    }
    if (best) learned.set(key, best.category);
  }
  return learned;
}

/**
 * Подсказка категории для нового описания.
 * Сначала точное совпадение, затем — известное описание внутри строки:
 * «Глобус продукты» найдёт запомненный «Глобус».
 */
export function suggestCategory(
  description: string,
  learned: LearnedCategories,
): CategoryId | null {
  const key = descriptionKey(description);
  if (!key) return null;

  const exact = learned.get(key);
  if (exact) return exact;

  // Из подходящих совпадений берём самое длинное — оно конкретнее:
  // «кофемашина» важнее «кофе», если подходят оба.
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const known of learned.keys()) {
    if (known.length < 3) continue;
    const len = matchLength(key, known);
    if (len > bestLen) {
      bestLen = len;
      bestKey = known;
    }
  }
  return bestKey ? (learned.get(bestKey) ?? null) : null;
}

/**
 * Длина совпадения описания с запомненным ключом, 0 — не совпало.
 *
 * Русские окончания мешают точному вхождению: запомнили «кофемашина», а ввели
 * «кофемашину». Поэтому у длинных слов допускаем усечение хвоста — грубая
 * замена морфологии, которой достаточно для бытовых описаний.
 */
function matchLength(text: string, known: string): number {
  if (text.includes(known)) return known.length;
  // Отрезаем до двух последних букв, но только у достаточно длинных ключей,
  // иначе короткие слова начнут ловить лишнее.
  for (const cut of [1, 2]) {
    const stem = known.slice(0, known.length - cut);
    if (stem.length >= 5 && text.includes(stem)) return stem.length;
  }
  return 0;
}
