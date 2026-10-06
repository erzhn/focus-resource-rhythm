import { type Decimal, ZERO, add, gt, max, sub, sum } from "./decimal";

/**
 * Баланс журнала и денежная просадка.
 *
 * Два разных числа, которые постоянно путают:
 *
 *   • учётный баланс — начальный капитал плюс внешние потоки плюс
 *     реализованный торговый результат;
 *   • накопленный торговый результат — только реализованные проводки.
 *
 * Пополнение увеличивает первое и НЕ трогает второе. Иначе достаточно завести
 * денег, чтобы кривая «доходности» пошла вверх.
 */

export interface CashFlow {
  kind: "deposit" | "withdrawal";
  /** Положительная сумма; знак задаётся видом операции. */
  amount: Decimal;
  at: Date;
}

/**
 * Проводка торгового результата: валовой P/L выхода или подписанный расход.
 * Уникальна для исходного события — повторная обработка не должна создавать
 * вторую такую же.
 */
export interface TradePosting {
  amount: Decimal;
  at: Date;
  sourceKey: string;
}

/** Ручная сверка с брокером: подписанная поправка с обязательной причиной. */
export interface Reconciliation {
  amount: Decimal;
  at: Date;
  reason: string;
}

export interface BalanceInput {
  openingBalance: Decimal;
  flows: CashFlow[];
  postings: TradePosting[];
  reconciliations: Reconciliation[];
}

const signedFlow = (f: CashFlow) => (f.kind === "deposit" ? f.amount : { ...f.amount, value: -f.amount.value });

/** Учётный баланс журнала на момент t (все события с at ≤ t). */
export function bookBalance(input: BalanceInput, at?: Date): Decimal {
  const upTo = <T extends { at: Date }>(items: T[]) =>
    at ? items.filter((i) => i.at.getTime() <= at.getTime()) : items;

  return add(
    add(
      add(input.openingBalance, sum(upTo(input.flows).map(signedFlow))),
      sum(upTo(input.postings).map((p) => p.amount)),
    ),
    sum(upTo(input.reconciliations).map((r) => r.amount)),
  );
}

/**
 * Накопленный торговый результат: только проводки сделок.
 * Внешние потоки сюда не входят — это и есть смысл отдельного показателя.
 */
export function cumulativeTradingPnl(postings: TradePosting[], at?: Date): Decimal {
  const items = at ? postings.filter((p) => p.at.getTime() <= at.getTime()) : postings;
  return sum(items.map((p) => p.amount));
}

/** Повторная обработка одного и того же события не должна удваивать деньги. */
export function dedupePostings(postings: TradePosting[]): TradePosting[] {
  const seen = new Set<string>();
  return postings.filter((p) => {
    if (seen.has(p.sourceKey)) return false;
    seen.add(p.sourceKey);
    return true;
  });
}

export interface Drawdown {
  /** Наибольшее падение от исторического максимума, положительное число. */
  maxDrawdown: Decimal;
  /** Текущее отклонение от максимума. */
  current: Decimal;
  peak: Decimal;
}

/**
 * Денежная просадка накопленного ТОРГОВОГО результата.
 *
 * Считается по кривой реализованного P/L, а не по пополняемому балансу:
 * иначе вывод денег выглядел бы убытком, а пополнение — восстановлением.
 * Процентная просадка здесь не считается намеренно — её нельзя получить
 * делением на кривую, начинающуюся с нуля.
 */
export function moneyDrawdown(postings: TradePosting[]): Drawdown {
  const ordered = [...postings].sort((a, b) => a.at.getTime() - b.at.getTime());

  let running = ZERO;
  let peak = ZERO;
  let maxDrawdown = ZERO;

  for (const p of ordered) {
    running = add(running, p.amount);
    peak = max(peak, running);
    const fallen = sub(peak, running);
    if (gt(fallen, maxDrawdown)) maxDrawdown = fallen;
  }

  return { maxDrawdown, current: sub(peak, running), peak };
}
