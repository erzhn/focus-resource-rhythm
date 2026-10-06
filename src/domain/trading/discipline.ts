import { type Decimal, ZERO, add, div, isPositive, sum } from "./decimal";
import { localDate, type LocalDate } from "./day";
import { SCALE, type Maybe, known, unknown } from "./types";

/**
 * Оценка дисциплины.
 *
 * Два правила, без которых показатель начинает врать:
 *
 * 1. Неизвестное не считается выполненным. Иначе достаточно не заполнить
 *    журнал, чтобы дисциплина выросла.
 * 2. Результат сделки не входит в оценку. «Была +1R, закрылась в минус» —
 *    наблюдение о результате, а не нарушение. Если смешать, график
 *    «дисциплина ↔ прибыль» будет отражать собственную формулу оценки.
 */

export type RuleStatus = "passed" | "failed" | "unknown" | "not_applicable";

/** Этап, на котором сделана проверка. */
export type RuleStage = "pre_entry" | "in_trade" | "post_trade";

export interface RuleEvaluation {
  ruleCode: string;
  ruleVersion: number;
  stage: RuleStage;
  status: RuleStatus;
  weight: Decimal;
  /** Проверка выполнена ПОЗЖЕ входа — для сравнения с результатом непригодна. */
  reconstructed: boolean;
  /** Почему статус unknown: чего именно не хватило. */
  unknownReason?: string;
}

export interface DisciplineResult {
  /** 0..100. Неизвестно, если ни одной проверки не выполнено и не нарушено. */
  score: Maybe<Decimal>;
  /** Какая доля правил вообще была проверена, 0..100. */
  coverage: Maybe<Decimal>;
  passed: number;
  failed: number;
  unknown: number;
  notApplicable: number;
}

const weightOf = (items: RuleEvaluation[]) => sum(items.map((i) => i.weight));

/**
 * Оценка и полнота.
 *
 * При пустом знаменателе возвращается «неизвестно», а не 100 % и не NaN:
 * отсутствие проверок не является безупречной дисциплиной.
 */
export function disciplineScore(evaluations: RuleEvaluation[]): DisciplineResult {
  const passed = evaluations.filter((e) => e.status === "passed");
  const failed = evaluations.filter((e) => e.status === "failed");
  const unknownItems = evaluations.filter((e) => e.status === "unknown");
  const notApplicable = evaluations.filter((e) => e.status === "not_applicable");

  const decided = weightOf([...passed, ...failed]);
  const observable = add(decided, weightOf(unknownItems));
  const hundred: Decimal = { value: 100n, scale: 0 };

  return {
    score: isPositive(decided)
      ? known(div(mulWeight(hundred, weightOf(passed)), decided, SCALE.pct))
      : unknown("Недостаточно данных: ни одна проверка не выполнена и не нарушена."),
    coverage: isPositive(observable)
      ? known(div(mulWeight(hundred, decided), observable, SCALE.pct))
      : unknown("Проверок, которые можно было бы оценить, не было."),
    passed: passed.length,
    failed: failed.length,
    unknown: unknownItems.length,
    notApplicable: notApplicable.length,
  };
}

function mulWeight(a: Decimal, b: Decimal): Decimal {
  return { value: a.value * b.value, scale: a.scale + b.scale };
}

/**
 * Для сравнения дисциплины с результатом годятся только проверки, сделанные
 * ДО входа и не восстановленные задним числом. Ретроспективно заполненный
 * чеклист — это память о сделке, а не проверка перед ней.
 */
export function comparableWithOutcome(evaluations: RuleEvaluation[]): RuleEvaluation[] {
  return evaluations.filter((e) => e.stage === "pre_entry" && !e.reconstructed);
}

/** Сделка для правил последовательности: нужны только времена и результат. */
export interface SequenceTrade {
  id: string;
  accountId: string;
  openedAt: Date;
  closedAt: Date | null;
  /** Чистый результат в валюте счёта; null — ещё не закрыта или неизвестен. */
  netAccount: Decimal | null;
}

/**
 * Предыдущая закрытая сделка относительно момента входа.
 *
 * Берётся сделка того же счёта, ЗАКРЫТАЯ строго до этого момента. Позиция,
 * которая тогда ещё оставалась открытой, в проверке не участвует: её будущий
 * результат на момент входа не был известен никому.
 */
export function previousClosedTrade(
  trades: SequenceTrade[],
  accountId: string,
  entryMoment: Date,
): SequenceTrade | null {
  const candidates = trades
    .filter((t) => t.accountId === accountId)
    .filter((t) => t.closedAt !== null && t.closedAt.getTime() < entryMoment.getTime())
    .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());
  return candidates[0] ?? null;
}

export interface EntryLimitResult {
  /** Номер входа внутри локального дня, начиная с 1. */
  ordinal: number;
  date: LocalDate;
  violates: boolean;
}

/**
 * Лимит числа входов за день.
 *
 * Нарушение начинается с (limit + 1)-го входа. Первые входы остаются чистыми:
 * помечать нарушением весь день задним числом значило бы наказывать за
 * решения, которые в момент принятия правилу не противоречили.
 */
export function entryLimitCheck(
  entryMoments: Date[],
  limit: number,
  timeZone: string,
): EntryLimitResult[] {
  const seen = new Map<LocalDate, number>();
  // Считаем в хронологическом порядке, а возвращаем в порядке входных данных.
  const order = entryMoments
    .map((at, index) => ({ at, index }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const results: EntryLimitResult[] = new Array(entryMoments.length);
  for (const { at, index } of order) {
    const date = localDate(at, timeZone);
    const ordinal = (seen.get(date) ?? 0) + 1;
    seen.set(date, ordinal);
    results[index] = { ordinal, date, violates: ordinal > limit };
  }
  return results;
}

/**
 * Активна ли пауза после убытка на момент входа.
 *
 * Пауза считается от закрытия предыдущей сделки, а не от её открытия: пока
 * позиция не закрыта, её результат неизвестен и поводом для паузы быть не может.
 */
export function pauseActive(
  previous: SequenceTrade | null,
  entryMoment: Date,
  pauseMinutes: number,
): Maybe<boolean> {
  if (previous === null) return known(false);
  if (previous.netAccount === null) {
    return unknown("Результат предыдущей сделки неизвестен — пауза не проверена.");
  }
  if (previous.netAccount.value >= 0n) return known(false);

  const until = previous.closedAt!.getTime() + pauseMinutes * 60_000;
  return known(entryMoment.getTime() < until);
}

/** Пустая оценка для правила, которое нечем проверить. */
export function unknownEvaluation(
  ruleCode: string,
  ruleVersion: number,
  stage: RuleStage,
  weight: Decimal,
  reason: string,
): RuleEvaluation {
  return {
    ruleCode,
    ruleVersion,
    stage,
    status: "unknown",
    weight,
    reconstructed: false,
    unknownReason: reason,
  };
}

export const ZERO_WEIGHT = ZERO;
