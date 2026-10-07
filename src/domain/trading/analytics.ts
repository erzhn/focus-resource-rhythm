import {
  type Decimal,
  ZERO,
  add,
  cmp,
  div,
  gt,
  isPositive,
  isZero,
  lt,
  mul,
  neg,
  round,
  sub,
  sum,
} from "./decimal";
import { SCALE, type Maybe, known, unknown } from "./types";

/**
 * Определения показателей.
 *
 * Самое опасное место всего модуля. Показатель, посчитанный «примерно так»,
 * выглядит ровно так же убедительно, как посчитанный правильно, — поэтому
 * здесь каждое определение записано явно и проверено тестами.
 *
 * Три правила:
 *
 * 1. Сделки с неизвестным R не исчезают: они считаются отдельно и
 *    показываются рядом. Молчаливое исключение завышало бы и средний R, и
 *    долю выигрышей.
 * 2. «P/L за период» и «статистика закрытых сделок» — РАЗНЫЕ выборки, и они
 *    могут давать разные суммы. Частичный выход в одном месяце и финальный в
 *    другом — обычное дело.
 * 3. Пустая выборка даёт «неизвестно», а не ноль и не 100 %.
 */

/** Сделка в том виде, в каком её читает аналитика. */
export interface AnalyticsTrade {
  id: string;
  instrumentCode: string;
  marketCode: string;
  direction: "long" | "short";
  openedAt: Date;
  closedAt: Date | null;
  localDate: string;
  status: "open" | "closed" | "voided";
  /** Чистый результат в валюте счёта; null — неизвестен. */
  netAccount: Decimal | null;
  /** Итоговый R; null — исходный риск неизвестен. */
  finalR: Decimal | null;
  setupId: string | null;
  emotionBefore: string | null;
}

/** Денежная проводка: выход или расход, отнесённый к моменту времени. */
export interface Posting {
  at: Date;
  amount: Decimal;
  tradeId: string;
}

export interface ClosedStats {
  /** Сколько сделок закрыто в выборке. */
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** Доля выигрышей среди закрытых, 0..100. Неизвестно при пустой выборке. */
  winRate: Maybe<Decimal>;
  /** Сумма положительных итогов / модуль суммы отрицательных. */
  profitFactor: Maybe<Decimal>;
  netPnl: Decimal;
  grossWin: Decimal;
  grossLoss: Decimal;
  /** Средний R по сделкам с ИЗВЕСТНЫМ R. */
  avgR: Maybe<Decimal>;
  sumR: Maybe<Decimal>;
  /** Сколько сделок имеют известный R и сколько нет. */
  knownR: number;
  unknownR: number;
  /** Сколько сделок без известного денежного результата. */
  unknownNet: number;
}

const HUNDRED: Decimal = { value: 100n, scale: 0 };

/**
 * Статистика закрытых сделок.
 *
 * Безубыточные выделены отдельно: относить их к выигрышам или проигрышам —
 * это решение, которое должно быть видимым, а не спрятанным в формуле.
 */
export function closedStats(trades: AnalyticsTrade[]): ClosedStats {
  const closed = trades.filter((t) => t.status === "closed");
  const withNet = closed.filter((t) => t.netAccount !== null);

  const wins = withNet.filter((t) => isPositive(t.netAccount!));
  const losses = withNet.filter((t) => lt(t.netAccount!, ZERO));
  const breakeven = withNet.filter((t) => isZero(t.netAccount!));

  const grossWin = sum(wins.map((t) => t.netAccount!));
  const grossLoss = sum(losses.map((t) => t.netAccount!));
  const netPnl = sum(withNet.map((t) => t.netAccount!));

  const rValues = closed.filter((t) => t.finalR !== null).map((t) => t.finalR!);

  return {
    count: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate:
      withNet.length === 0
        ? unknown("Нет закрытых сделок с известным результатом.")
        : known(div(mul(HUNDRED, { value: BigInt(wins.length), scale: 0 }), { value: BigInt(withNet.length), scale: 0 }, SCALE.pct)),
    profitFactor: profitFactor(grossWin, grossLoss),
    netPnl,
    grossWin,
    grossLoss: neg(grossLoss),
    avgR:
      rValues.length === 0
        ? unknown("Ни у одной сделки нет известного R.")
        : known(div(sum(rValues), { value: BigInt(rValues.length), scale: 0 }, SCALE.r)),
    sumR: rValues.length === 0 ? unknown("Ни у одной сделки нет известного R.") : known(sum(rValues)),
    knownR: rValues.length,
    unknownR: closed.length - rValues.length,
    unknownNet: closed.length - withNet.length,
  };
}

/**
 * Профит-фактор.
 *
 * При отсутствии убытков это не бесконечность и не выдуманное большое число:
 * показателя просто нет, и так и говорим. Деление на ноль здесь — не ошибка
 * вычисления, а отсутствие знаменателя по смыслу.
 */
function profitFactor(grossWin: Decimal, grossLossNegative: Decimal): Maybe<Decimal> {
  const lossMagnitude = neg(grossLossNegative);
  if (isZero(lossMagnitude)) {
    return isZero(grossWin)
      ? unknown("Нет ни прибылей, ни убытков.")
      : unknown("Убыточных сделок не было — делить не на что.");
  }
  return known(div(grossWin, lossMagnitude, 4));
}

/**
 * Реализованный результат за период — по ПРОВОДКАМ, а не по закрытиям.
 *
 * Отличается от статистики закрытых сделок: частичный выход мог быть в одном
 * периоде, а финальный — в другом. Обе величины верны, они просто отвечают на
 * разные вопросы.
 */
export function realizedInPeriod(postings: Posting[], from: Date, to: Date): Decimal {
  return sum(
    postings
      .filter((p) => p.at.getTime() >= from.getTime() && p.at.getTime() <= to.getTime())
      .map((p) => p.amount),
  );
}

export interface CurvePoint {
  at: Date;
  /** Накопленный реализованный результат. */
  cumulative: Decimal;
}

/** Кривая накопленного торгового результата по проводкам. */
export function equityCurve(postings: Posting[]): CurvePoint[] {
  const ordered = [...postings].sort((a, b) => a.at.getTime() - b.at.getTime());
  const points: CurvePoint[] = [];
  let running = ZERO;
  for (const p of ordered) {
    running = add(running, p.amount);
    points.push({ at: p.at, cumulative: running });
  }
  return points;
}

export interface GroupStats extends ClosedStats {
  key: string;
  label: string;
  /** Наблюдений слишком мало, чтобы делать выводы. */
  smallSample: boolean;
}

/** Порог малой выборки. Это не граница достоверности, а повод для осторожности. */
export const SMALL_SAMPLE = 10;

/**
 * Разрез по произвольному признаку: инструмент, рынок, направление, час.
 *
 * Группы с малым числом наблюдений помечаются, но не скрываются: спрятать их
 * значило бы создать впечатление, что остальных данных достаточно.
 */
export function groupStats(
  trades: AnalyticsTrade[],
  key: (t: AnalyticsTrade) => { key: string; label: string },
): GroupStats[] {
  const groups = new Map<string, { label: string; items: AnalyticsTrade[] }>();

  for (const trade of trades) {
    const { key: k, label } = key(trade);
    const bucket = groups.get(k) ?? { label, items: [] };
    bucket.items.push(trade);
    groups.set(k, bucket);
  }

  return [...groups.entries()]
    .map(([k, { label, items }]) => ({
      key: k,
      label,
      smallSample: items.filter((t) => t.status === "closed").length < SMALL_SAMPLE,
      ...closedStats(items),
    }))
    .sort((a, b) => cmp(b.netPnl, a.netPnl) || b.count - a.count);
}

export interface RBucket {
  /** Нижняя граница включительно. */
  from: number;
  /** Верхняя граница исключительно; null — без верхней границы. */
  to: number | null;
  label: string;
  count: number;
}

/**
 * Распределение R.
 *
 * Сделки без известного R в столбцы не попадают — их число возвращается
 * отдельно, чтобы гистограмма не выглядела полной картиной.
 */
export function rDistribution(trades: AnalyticsTrade[]): {
  buckets: RBucket[];
  unknown: number;
} {
  const edges: { from: number; to: number | null; label: string }[] = [
    { from: -Infinity, to: -2, label: "ниже −2R" },
    { from: -2, to: -1, label: "−2…−1R" },
    { from: -1, to: 0, label: "−1…0R" },
    { from: 0, to: 1, label: "0…1R" },
    { from: 1, to: 2, label: "1…2R" },
    { from: 2, to: 3, label: "2…3R" },
    { from: 3, to: null, label: "от 3R" },
  ];

  const buckets: RBucket[] = edges.map((e) => ({ ...e, count: 0 }));
  let unknownCount = 0;

  for (const t of trades) {
    if (t.status !== "closed") continue;
    if (t.finalR === null) {
      unknownCount += 1;
      continue;
    }
    const value = Number(`${t.finalR.value}e-${t.finalR.scale}`);
    const index = buckets.findIndex((b) => value >= b.from && (b.to === null || value < b.to));
    if (index >= 0) buckets[index].count += 1;
  }

  return { buckets, unknown: unknownCount };
}

export interface Observation {
  code: string;
  title: string;
  /** Сколько сделок попало под наблюдение. */
  count: number;
  /** На чём основано — показывается рядом с числом. */
  basis: string;
  tradeIds: string[];
}

/**
 * Проверяемые наблюдения на реальных агрегатах.
 *
 * Формулировки намеренно описательные. «Сделок с неизвестным стопом: 4» — это
 * факт. «Нарушения стоили вам $X» — уже утверждение о причине, которого данные
 * не подтверждают: одна сделка может нарушать несколько правил, а суммы групп
 * пересекаются и не складываются в независимые потери.
 */
export function observations(trades: AnalyticsTrade[]): Observation[] {
  const result: Observation[] = [];
  const closed = trades.filter((t) => t.status === "closed");

  const noRisk = closed.filter((t) => t.finalR === null);
  if (noRisk.length > 0) {
    result.push({
      code: "unknown_r",
      title: `Итог в R неизвестен: ${noRisk.length} ${plural(noRisk.length, "сделка", "сделки", "сделок")}`,
      count: noRisk.length,
      basis: "у этих сделок не записан исходный стоп или баланс на входе",
      tradeIds: noRisk.map((t) => t.id),
    });
  }

  const noNet = closed.filter((t) => t.netAccount === null);
  if (noNet.length > 0) {
    result.push({
      code: "unknown_net",
      title: `Денежный итог неизвестен: ${noNet.length}`,
      count: noNet.length,
      basis: "не задан курс валюты инструмента к валюте счёта",
      tradeIds: noNet.map((t) => t.id),
    });
  }

  // Несколько входов в один локальный день — наблюдение, а не нарушение:
  // лимит задаёт пользователь, и без него говорить о превышении нельзя.
  const byDay = new Map<string, AnalyticsTrade[]>();
  for (const t of trades) {
    const list = byDay.get(t.localDate) ?? [];
    list.push(t);
    byDay.set(t.localDate, list);
  }
  const busyDays = [...byDay.entries()].filter(([, items]) => items.length >= 4);
  if (busyDays.length > 0) {
    const ids = busyDays.flatMap(([, items]) => items.map((t) => t.id));
    result.push({
      code: "many_entries",
      title: `Дней с четырьмя и более входами: ${busyDays.length}`,
      count: busyDays.length,
      basis: "границы дня — по часовому поясу счёта",
      tradeIds: ids,
    });
  }

  const setupsMissing = closed.filter((t) => t.setupId === null);
  if (setupsMissing.length > 0 && closed.length > 0) {
    result.push({
      code: "no_setup",
      title: `Без указанного сетапа: ${setupsMissing.length} из ${closed.length}`,
      count: setupsMissing.length,
      basis: "разрез по сетапам строится только по сделкам, где он указан",
      tradeIds: setupsMissing.map((t) => t.id),
    });
  }

  return result;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/**
 * Сравнение двух периодов одинаковой длительности.
 *
 * При нулевой базе процент изменения не выдумывается: «было 0, стало 50» — это
 * не «рост на 100 %» и не «на бесконечность».
 */
export function compareToPrevious(current: Decimal, previous: Decimal): Maybe<Decimal> {
  if (isZero(previous)) {
    return unknown("В предыдущем периоде база равна нулю — процент изменения не определён.");
  }
  const diff = sub(current, previous);
  const magnitude = lt(previous, ZERO) ? neg(previous) : previous;
  return known(round(div(mul(HUNDRED, diff), magnitude, SCALE.pct), 2));
}

/** Денежная просадка по кривой накопленного результата. */
export function drawdown(points: CurvePoint[]): { max: Decimal; current: Decimal; peak: Decimal } {
  let peak = ZERO;
  let max = ZERO;
  let last = ZERO;

  for (const p of points) {
    last = p.cumulative;
    if (gt(p.cumulative, peak)) peak = p.cumulative;
    const fallen = sub(peak, p.cumulative);
    if (gt(fallen, max)) max = fallen;
  }

  return { max, current: sub(peak, last), peak };
}
