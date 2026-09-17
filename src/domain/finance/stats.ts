import { CATEGORY_BY_ID, type CategoryId, type TxKind } from "./categories";
import { monthOf, type FinancialDay } from "./day";

/**
 * Сводки по операциям: день, категории, месяц, бюджет.
 *
 * Все суммы — в минорных единицах и в одной валюте. Операции в других валютах
 * НЕ конвертируются и не смешиваются: курс придумывать нельзя, поэтому они
 * считаются отдельно и показываются рядом.
 */

export interface Transaction {
  id: string;
  kind: TxKind;
  amountMinor: number;
  currency: string;
  category: CategoryId | null;
  description: string;
  /** Момент операции. */
  occurredAt: Date;
  /** Финансовый день, к которому отнесена операция. */
  day: FinancialDay;
}

export interface CategoryTotal {
  category: CategoryId;
  label: string;
  color: string;
  emoji: string;
  amountMinor: number;
  count: number;
  /** Доля от всех расходов, 0..1. */
  share: number;
}

export interface DaySummary {
  day: FinancialDay;
  expensesMinor: number;
  incomeMinor: number;
  refundsMinor: number;
  /** Расходы за вычетом возвратов — то, что реально ушло. */
  netExpensesMinor: number;
  count: number;
  byCategory: CategoryTotal[];
  largest: Transaction | null;
  /** Суммы в валютах, отличных от основной. */
  otherCurrencies: { currency: string; expensesMinor: number; incomeMinor: number }[];
}

const isMain = (t: Transaction, currency: string) => t.currency === currency;

/** Сводка за один финансовый день. */
export function summarizeDay(
  transactions: Transaction[],
  day: FinancialDay,
  mainCurrency = "KGS",
): DaySummary {
  const all = transactions.filter((t) => t.day === day);
  return summarize(all, day, mainCurrency);
}

/** Сводка за произвольный набор операций (день, неделя, месяц). */
export function summarize(
  all: Transaction[],
  day: FinancialDay,
  mainCurrency = "KGS",
): DaySummary {
  const main = all.filter((t) => isMain(t, mainCurrency));

  const expenses = main.filter((t) => t.kind === "expense");
  const incomes = main.filter((t) => t.kind === "income");
  const refunds = main.filter((t) => t.kind === "refund");

  const sum = (list: Transaction[]) => list.reduce((s, t) => s + t.amountMinor, 0);
  const expensesMinor = sum(expenses);
  const refundsMinor = sum(refunds);

  const byCategoryMap = new Map<CategoryId, { amountMinor: number; count: number }>();
  for (const t of expenses) {
    const key = t.category ?? "other";
    const prev = byCategoryMap.get(key) ?? { amountMinor: 0, count: 0 };
    byCategoryMap.set(key, { amountMinor: prev.amountMinor + t.amountMinor, count: prev.count + 1 });
  }

  const byCategory: CategoryTotal[] = [...byCategoryMap.entries()]
    .map(([category, v]) => {
      const meta = CATEGORY_BY_ID.get(category)!;
      return {
        category,
        label: meta.label,
        color: meta.color,
        emoji: meta.emoji,
        amountMinor: v.amountMinor,
        count: v.count,
        share: expensesMinor > 0 ? v.amountMinor / expensesMinor : 0,
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const largest = expenses.reduce<Transaction | null>(
    (max, t) => (!max || t.amountMinor > max.amountMinor ? t : max),
    null,
  );

  // Прочие валюты — отдельными строками, без пересчёта в основную.
  const otherMap = new Map<string, { expensesMinor: number; incomeMinor: number }>();
  for (const t of all) {
    if (isMain(t, mainCurrency)) continue;
    const prev = otherMap.get(t.currency) ?? { expensesMinor: 0, incomeMinor: 0 };
    if (t.kind === "income") prev.incomeMinor += t.amountMinor;
    else if (t.kind === "expense") prev.expensesMinor += t.amountMinor;
    otherMap.set(t.currency, prev);
  }

  return {
    day,
    expensesMinor,
    incomeMinor: sum(incomes),
    refundsMinor,
    netExpensesMinor: expensesMinor - refundsMinor,
    count: expenses.length,
    byCategory,
    largest,
    otherCurrencies: [...otherMap.entries()].map(([currency, v]) => ({ currency, ...v })),
  };
}

/** Сводка за календарный месяц финансового дня. */
export function summarizeMonth(
  transactions: Transaction[],
  day: FinancialDay,
  mainCurrency = "KGS",
): DaySummary {
  const m = monthOf(day);
  return summarize(transactions.filter((t) => monthOf(t.day) === m), day, mainCurrency);
}

export interface BudgetStatus {
  limitMinor: number;
  spentMinor: number;
  /** Может быть отрицательным при превышении. */
  leftMinor: number;
  /** Доля использованного, 0..N (больше 1 — превышение). */
  ratio: number;
  over: boolean;
  overByMinor: number;
}

/** Состояние бюджета. Возвращает null, если лимит не задан. */
export function budgetStatus(spentMinor: number, limitMinor: number | null): BudgetStatus | null {
  if (limitMinor === null || limitMinor <= 0) return null;
  const leftMinor = limitMinor - spentMinor;
  return {
    limitMinor,
    spentMinor,
    leftMinor,
    ratio: spentMinor / limitMinor,
    over: spentMinor > limitMinor,
    overByMinor: Math.max(0, spentMinor - limitMinor),
  };
}

/**
 * Расчётный баланс: начальный + доходы + возвраты − расходы.
 * Возвраты прибавляются, потому что расход уже был учтён ранее.
 */
export function computeBalance(
  transactions: Transaction[],
  openingBalanceMinor: number | null,
  mainCurrency = "KGS",
): number | null {
  if (openingBalanceMinor === null) return null;
  return transactions
    .filter((t) => t.currency === mainCurrency)
    .reduce((acc, t) => {
      if (t.kind === "expense") return acc - t.amountMinor;
      return acc + t.amountMinor;
    }, openingBalanceMinor);
}
