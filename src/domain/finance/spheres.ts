import type { CategoryId } from "./categories";
import type { Transaction } from "./stats";

/**
 * Связь трат со сферами жизни.
 *
 * Сфера не выбирается при каждой записи — это замедлило бы быстрый ввод, ради
 * которого учёт и делался. Вместо этого категория один раз сопоставляется со
 * сферой в настройках, и расходы раскладываются по сферам сами.
 *
 * Категории без сопоставления не приписываются никуда: они считаются отдельно
 * («не распределено»), чтобы сумма по сферам не выглядела полной, когда она
 * таковой не является.
 */

/** Категория → id сферы жизни. Отсутствие ключа означает «не сопоставлено». */
export type CategoryAreas = Partial<Record<CategoryId, string>>;

export interface AreaSpending {
  areaId: string;
  amountMinor: number;
  /** Доля от РАСПРЕДЕЛЁННЫХ трат, 0..1. */
  share: number;
  count: number;
  /** Какие категории сюда попали — чтобы было видно, откуда взялась сумма. */
  categories: CategoryId[];
}

export interface AreaBreakdown {
  areas: AreaSpending[];
  /** Сумма расходов, у которых категория сопоставлена со сферой. */
  mappedMinor: number;
  /** Сумма расходов без сопоставления — их не приписываем ни к одной сфере. */
  unmappedMinor: number;
}

/**
 * Разрез расходов по сферам жизни.
 *
 * Возвраты вычитаются из своей категории: иначе сфера выглядит дороже, чем
 * обошлась. Операции в другой валюте пропускаются — складывать сомы с
 * долларами без курса нельзя, а курс мы не выдумываем.
 */
export function spendingByArea(
  transactions: Transaction[],
  mapping: CategoryAreas,
  mainCurrency = "KGS",
): AreaBreakdown {
  const byArea = new Map<string, { amountMinor: number; count: number; categories: Set<CategoryId> }>();
  let mappedMinor = 0;
  let unmappedMinor = 0;

  for (const t of transactions) {
    if (t.currency !== mainCurrency) continue;
    if (t.kind === "income") continue;
    if (!t.category) continue;

    const signed = t.kind === "refund" ? -t.amountMinor : t.amountMinor;
    const areaId = mapping[t.category];

    if (!areaId) {
      unmappedMinor += signed;
      continue;
    }

    mappedMinor += signed;
    const acc = byArea.get(areaId) ?? { amountMinor: 0, count: 0, categories: new Set<CategoryId>() };
    acc.amountMinor += signed;
    // Возврат не считается покупкой: он отменяет уже учтённую.
    if (t.kind === "expense") acc.count += 1;
    acc.categories.add(t.category);
    byArea.set(areaId, acc);
  }

  const areas = [...byArea.entries()]
    .map(([areaId, a]) => ({
      areaId,
      amountMinor: a.amountMinor,
      share: mappedMinor > 0 ? a.amountMinor / mappedMinor : 0,
      count: a.count,
      categories: [...a.categories],
    }))
    .sort((x, y) => y.amountMinor - x.amountMinor);

  return { areas, mappedMinor, unmappedMinor };
}

/** Категории, для которых сфера ещё не выбрана, — подсказка в настройках. */
export function unmappedCategories(
  transactions: Transaction[],
  mapping: CategoryAreas,
): CategoryId[] {
  const seen = new Set<CategoryId>();
  for (const t of transactions) {
    if (t.kind === "expense" && t.category && !mapping[t.category]) seen.add(t.category);
  }
  return [...seen];
}
