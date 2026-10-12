import { type Decimal, ZERO, add, dec, div, gt, isPositive, lt, lte, mul, neg, toTrimmedString } from "./decimal";
import type { InitialRisk } from "./trade-math";
import type { Maybe } from "./types";
import type { RuleEvaluation, RuleStage, SequenceTrade } from "./discipline";

/**
 * Проверки перед входом.
 *
 * Три решения, без которых показатель дисциплины начал бы врать:
 *
 * 1. Порог задаёт пользователь. Никаких «безопасных» 5–8 % по умолчанию:
 *    подставленное число выглядит рекомендацией, а она тут не от кого.
 *    Включённое правило без порога даёт unknown, а не passed.
 * 2. Нехватка данных — это unknown с причиной, а не «нарушения не было».
 *    Пустой календарь событий не доказывает, что новостей не было.
 * 3. Результат сделки в проверки не входит вовсе. Проверяется то, что было
 *    известно ДО входа.
 */

export type RuleCode =
  | "stop_required"
  | "risk_per_trade"
  | "open_risk_total"
  | "daily_loss_limit"
  | "max_entries_per_day"
  | "pause_after_loss"
  | "pause_after_streak"
  | "news_window"
  | "setup_required";

export interface RuleDefinition {
  code: RuleCode;
  title: string;
  stage: RuleStage;
  /** Какой параметр нужен правилу; null — порога не требует. */
  param: { key: string; label: string; unit: string } | null;
  hint: string;
}

/**
 * Встроенные правила. Каждому соответствует реализованный алгоритм: строка в
 * таблице без алгоритма ничего не проверяла бы, а выглядела бы настроенной.
 */
export const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    code: "stop_required",
    title: "Стоп задан до входа",
    stage: "pre_entry",
    param: null,
    hint: "Без исходного стопа риск и R неизвестны навсегда.",
  },
  {
    code: "risk_per_trade",
    title: "Риск на сделку",
    stage: "pre_entry",
    param: { key: "maxPct", label: "Не больше", unit: "% от баланса" },
    hint: "Доля баланса, которой вы готовы рискнуть в одной сделке.",
  },
  {
    code: "open_risk_total",
    title: "Суммарный открытый риск",
    stage: "pre_entry",
    param: { key: "maxPct", label: "Не больше", unit: "% от баланса" },
    hint: "Риск всех открытых позиций вместе с новой.",
  },
  {
    code: "daily_loss_limit",
    title: "Дневной лимит убытка",
    stage: "pre_entry",
    param: { key: "maxPct", label: "Не больше", unit: "% от баланса на начало дня" },
    hint: "После какого убытка за день вы перестаёте торговать.",
  },
  {
    code: "max_entries_per_day",
    title: "Входов за день",
    stage: "pre_entry",
    param: { key: "max", label: "Не больше", unit: "входов" },
    hint: "Нарушением считается следующий вход после лимита, а не весь день.",
  },
  {
    code: "pause_after_loss",
    title: "Пауза после убытка",
    stage: "pre_entry",
    param: { key: "minutes", label: "Пауза", unit: "минут" },
    hint: "Отсчитывается от закрытия предыдущей сделки, а не от её открытия.",
  },
  {
    code: "pause_after_streak",
    title: "Пауза после серии убытков",
    stage: "pre_entry",
    param: { key: "losses", label: "Серия", unit: "убытков подряд" },
    hint: "Сколько убытков подряд означают остановку на сегодня.",
  },
  {
    code: "news_window",
    title: "Окно важных событий",
    stage: "pre_entry",
    param: { key: "minutes", label: "Окно", unit: "минут до и после" },
    hint: "Календарь заполняется вручную, поэтому «новостей нет» — это unknown.",
  },
  {
    code: "setup_required",
    title: "Сетап указан",
    stage: "pre_entry",
    param: null,
    hint: "Без сетапа разрез по стратегиям построить не из чего.",
  },
];

export const RULE_BY_CODE = new Map(RULE_DEFINITIONS.map((r) => [r.code, r]));

export interface RuleConfig {
  code: RuleCode;
  enabled: boolean;
  mode: "warn" | "block_plan";
  weight: Decimal;
  /** Пороги строками: десятичная арифметика, а не JS-числа. */
  params: Record<string, string | null>;
  version: number;
}

/** Данные, известные НА МОМЕНТ входа. Ничего из будущего здесь быть не может. */
export interface RuleContext {
  risk: InitialRisk;
  hasStop: boolean;
  setupId: string | null;
  balanceAtEntry: Decimal | null;
  /** Суммарный плановый риск уже открытых позиций. */
  openRiskAccount: Maybe<Decimal>;
  /** Реализованный результат за текущий локальный день (отрицательный — убыток). */
  realizedToday: Maybe<Decimal>;
  balanceAtDayStart: Decimal | null;
  /** Сколько входов уже было в этот локальный день. */
  entriesToday: number;
  previousClosed: SequenceTrade | null;
  /** Убытков подряд среди последних закрытых сделок. */
  lossStreak: number;
  /** Попадает ли вход в окно важного события. */
  newsWindow: "inside" | "outside" | "unknown";
  entryMoment: Date;
}

const pass = (c: RuleConfig, evidence: Record<string, unknown> = {}): RuleEvaluation => ({
  ruleCode: c.code,
  ruleVersion: c.version,
  stage: "pre_entry",
  status: "passed",
  weight: c.weight,
  reconstructed: false,
  evidence,
});

const failWith = (c: RuleConfig): RuleEvaluation => ({
  ruleCode: c.code,
  ruleVersion: c.version,
  stage: "pre_entry",
  status: "failed",
  weight: c.weight,
  reconstructed: false,
});

const unknownWith = (c: RuleConfig, reason: string): RuleEvaluation => ({
  ruleCode: c.code,
  ruleVersion: c.version,
  stage: "pre_entry",
  status: "unknown",
  weight: c.weight,
  reconstructed: false,
  unknownReason: reason,
});

/** Порог из параметров правила. null — не задан, и это не ноль. */
function threshold(config: RuleConfig, key: string): Decimal | null {
  const raw = config.params[key];
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  try {
    return dec(String(raw).trim().replace(",", "."));
  } catch {
    return null;
  }
}

const HUNDRED: Decimal = { value: 100n, scale: 0 };

/** Доля суммы от базы в процентах; null, если базы нет или она не положительна. */
function percentOf(amount: Decimal, base: Decimal | null): Decimal | null {
  if (base === null || !isPositive(base)) return null;
  return div(mul(HUNDRED, amount), base, 6);
}

/**
 * Выполняет включённые правила.
 *
 * Выключенные правила в результат не попадают вовсе: not_applicable нужен для
 * правил, которые включены, но к этой сделке не относятся.
 */
export function evaluatePreEntryRules(
  configs: RuleConfig[],
  ctx: RuleContext,
): RuleEvaluation[] {
  return configs.filter((c) => c.enabled).map((config) => evaluateOne(config, ctx));
}

function evaluateOne(config: RuleConfig, ctx: RuleContext): RuleEvaluation {
  switch (config.code) {
    case "stop_required":
      return ctx.hasStop ? pass(config, {}) : failWith(config);

    case "setup_required":
      return ctx.setupId ? pass(config, {}) : failWith(config);

    case "risk_per_trade": {
      const limit = threshold(config, "maxPct");
      if (limit === null) return unknownWith(config, "Порог не задан.");
      if (!ctx.risk.riskAccount.known) {
        return unknownWith(config, ctx.risk.riskAccount.reason);
      }
      const actual = percentOf(ctx.risk.riskAccount.value, ctx.balanceAtEntry);
      if (actual === null) {
        return unknownWith(config, "Баланс на момент входа неизвестен — долю риска не с чем сравнить.");
      }
      return lte(actual, limit) ? pass(config, { actual: toTrimmedString(actual) }) : failWith(config);
    }

    case "open_risk_total": {
      const limit = threshold(config, "maxPct");
      if (limit === null) return unknownWith(config, "Порог не задан.");
      if (!ctx.risk.riskAccount.known) return unknownWith(config, ctx.risk.riskAccount.reason);
      if (!ctx.openRiskAccount.known) return unknownWith(config, ctx.openRiskAccount.reason);

      const total = add(ctx.risk.riskAccount.value, ctx.openRiskAccount.value);
      const actual = percentOf(total, ctx.balanceAtEntry);
      if (actual === null) return unknownWith(config, "Баланс на момент входа неизвестен.");
      return lte(actual, limit) ? pass(config, { actual: toTrimmedString(actual) }) : failWith(config);
    }

    case "daily_loss_limit": {
      const limit = threshold(config, "maxPct");
      if (limit === null) return unknownWith(config, "Порог не задан.");
      if (!ctx.realizedToday.known) return unknownWith(config, ctx.realizedToday.reason);

      // Прибыльный день лимита убытка не нарушает.
      if (!lt(ctx.realizedToday.value, ZERO)) return pass(config, { loss: "0" });

      const loss = neg(ctx.realizedToday.value);
      const actual = percentOf(loss, ctx.balanceAtDayStart);
      if (actual === null) {
        return unknownWith(config, "Баланс на начало дня неизвестен — долю убытка не с чем сравнить.");
      }
      return lt(actual, limit) ? pass(config, { actual: toTrimmedString(actual) }) : failWith(config);
    }

    case "max_entries_per_day": {
      const limit = threshold(config, "max");
      if (limit === null) return unknownWith(config, "Порог не задан.");
      // Нарушает (limit + 1)-й вход, а не все сделки такого дня.
      const ordinal: Decimal = { value: BigInt(ctx.entriesToday + 1), scale: 0 };
      return lte(ordinal, limit) ? pass(config, { ordinal: ctx.entriesToday + 1 }) : failWith(config);
    }

    case "pause_after_loss": {
      const minutes = threshold(config, "minutes");
      if (minutes === null) return unknownWith(config, "Порог не задан.");
      const previous = ctx.previousClosed;
      if (previous === null) return pass(config, { reason: "предыдущих закрытых сделок нет" });
      if (previous.netAccount === null) {
        return unknownWith(config, "Результат предыдущей сделки неизвестен — паузу не проверить.");
      }
      if (!lt(previous.netAccount, ZERO)) return pass(config, { reason: "предыдущая не в убытке" });

      const waitMs = Number(toTrimmedString(minutes)) * 60_000;
      const until = previous.closedAt!.getTime() + waitMs;
      return ctx.entryMoment.getTime() >= until
        ? pass(config, { waitedUntil: new Date(until).toISOString() })
        : failWith(config);
    }

    case "pause_after_streak": {
      const limit = threshold(config, "losses");
      if (limit === null) return unknownWith(config, "Порог не задан.");
      const streak: Decimal = { value: BigInt(ctx.lossStreak), scale: 0 };
      return lt(streak, limit) ? pass(config, { streak: ctx.lossStreak }) : failWith(config);
    }

    case "news_window": {
      const minutes = threshold(config, "minutes");
      if (minutes === null) return unknownWith(config, "Порог не задан.");
      if (ctx.newsWindow === "unknown") {
        return unknownWith(
          config,
          "Календарь событий не заполнен: отсутствие записи не доказывает, что новостей не было.",
        );
      }
      return ctx.newsWindow === "outside" ? pass(config, {}) : failWith(config);
    }
  }
}

/**
 * Можно ли одобрить план.
 *
 * Блокируют только правила в режиме block_plan и только со статусом failed.
 * unknown не блокирует: нехватка данных — не доказательство нарушения.
 */
export function blockingViolations(
  evaluations: RuleEvaluation[],
  configs: RuleConfig[],
): RuleEvaluation[] {
  const blocking = new Set(
    configs.filter((c) => c.mode === "block_plan").map((c) => c.code as string),
  );
  return evaluations.filter((e) => e.status === "failed" && blocking.has(e.ruleCode));
}

/** Убытков подряд среди последних закрытых сделок. */
export function lossStreakOf(trades: SequenceTrade[]): number {
  const closed = trades
    .filter((t) => t.closedAt !== null && t.netAccount !== null)
    .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());

  let streak = 0;
  for (const trade of closed) {
    if (gt(ZERO, trade.netAccount!)) streak += 1;
    else break;
  }
  return streak;
}
