import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZERO, add, dec, sub, type Decimal } from "@/domain/trading/decimal";
import { dayRange, localDate } from "@/domain/trading/day";
import { known, unknown, type Maybe } from "@/domain/trading/types";
import { lossStreakOf, RULE_DEFINITIONS, type RuleCode, type RuleConfig, type RuleContext } from "@/domain/trading/rules";
import type { InitialRisk } from "@/domain/trading/trade-math";
import type { SequenceTrade } from "@/domain/trading/discipline";
import { toDec } from "./mappers";

/**
 * Загрузка правил и сбор контекста для проверок.
 *
 * Контекст собирается ТОЛЬКО из того, что известно на момент входа. Ни одно
 * поле здесь не может прийти из будущего: результат ещё не закрытой позиции
 * в проверке не участвует, потому что в момент входа его не знал никто.
 */

export interface StoredRule {
  id: string;
  rule_code: RuleCode;
  mode: "warn" | "block_plan";
  weight: string;
  enabled: boolean;
  params: Record<string, string | null>;
  title: string;
  rule_set_id: string;
  version: number;
}

export interface RuleSet {
  id: string;
  version: number;
  rules: StoredRule[];
}

/**
 * Набор правил счёта. Если его ещё нет, создаётся пустой: все правила
 * выключены и без порогов — пороги задаёт владелец, а не приложение.
 */
export async function loadRuleSet(
  sb: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<RuleSet | null> {
  const { data: set } = await sb
    .from("trading_rule_sets")
    .select("id, version")
    .eq("account_id", accountId)
    .eq("is_current", true)
    .maybeSingle();

  if (!set) return null;

  const { data: rules } = await sb
    .from("trading_rules")
    .select("*")
    .eq("rule_set_id", set.id)
    .order("rule_code");

  void userId;
  return {
    id: set.id as string,
    version: set.version as number,
    rules: (rules ?? []) as StoredRule[],
  };
}

/** Создаёт набор правил со всеми встроенными правилами в выключенном виде. */
export async function ensureRuleSet(
  sb: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<RuleSet> {
  const existing = await loadRuleSet(sb, userId, accountId);
  if (existing) return existing;

  const { data: set, error } = await sb
    .from("trading_rule_sets")
    .insert({ user_id: userId, account_id: accountId, version: 1, is_current: true })
    .select("id, version")
    .single();
  if (error) throw new Error(`Не удалось создать набор правил: ${error.message}`);

  const rows = RULE_DEFINITIONS.map((d) => ({
    user_id: userId,
    rule_set_id: set.id,
    rule_code: d.code,
    stage: d.stage,
    mode: "warn",
    weight: "1",
    // Выключены и без порогов: подставленный порог выглядел бы рекомендацией.
    enabled: false,
    params: {},
    title: d.title,
  }));
  await sb.from("trading_rules").insert(rows);

  return (await loadRuleSet(sb, userId, accountId))!;
}

export function toConfigs(set: RuleSet): RuleConfig[] {
  return set.rules.map((r) => ({
    code: r.rule_code,
    enabled: r.enabled,
    mode: r.mode,
    weight: toDec(r.weight) ?? dec("1"),
    params: r.params ?? {},
    version: set.version,
  }));
}

export interface ContextInput {
  accountId: string;
  userId: string;
  timezone: string;
  bookBalance: string;
  instrumentId: string;
  entryMoment: Date;
  risk: InitialRisk;
  hasStop: boolean;
  setupId: string | null;
  balanceAtEntry: Decimal | null;
  newsWindowMinutes: number | null;
}

/** Собирает всё, что нужно проверкам, одним набором запросов. */
export async function buildRuleContext(
  sb: SupabaseClient,
  input: ContextInput,
): Promise<RuleContext> {
  const today = localDate(input.entryMoment, input.timezone);
  const { start, end } = dayRange(today, input.timezone);

  const [openResult, todayResult, recentResult, flowsResult, eventsResult] = await Promise.all([
    sb
      .from("trading_trades_v")
      .select("id, initial_risk_account, unknown_reason")
      .eq("account_id", input.accountId)
      .eq("status", "open"),
    sb
      .from("trading_trades_v")
      .select("id, local_date, status, net_realized_account, closed_at")
      .eq("account_id", input.accountId)
      .neq("status", "voided")
      .gte("local_date", today)
      .lte("local_date", today),
    sb
      .from("trading_trades_v")
      .select("id, account_id, opened_at, closed_at, net_realized_account")
      .eq("account_id", input.accountId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(20),
    sb
      .from("trading_cash_flows")
      .select("kind, amount, occurred_at")
      .eq("account_id", input.accountId)
      .gte("occurred_at", start.toISOString())
      .lte("occurred_at", end.toISOString()),
    sb
      .from("economic_events")
      .select("id, scheduled_at, instrument_id, market_code, currency")
      .eq("user_id", input.userId)
      .limit(500),
  ]);

  // Суммарный риск уже открытых позиций. Позиция с неизвестным риском делает
  // неизвестной всю сумму — иначе лимит проверялся бы по заниженному числу.
  let openRisk: Maybe<Decimal> = known(ZERO);
  for (const row of openResult.data ?? []) {
    const value = toDec(row.initial_risk_account as string | null);
    if (value === null) {
      openRisk = unknown("У одной из открытых позиций риск неизвестен — сумму не сложить.");
      break;
    }
    if (openRisk.known) openRisk = known(add(openRisk.value, value));
  }

  // Реализованный результат за сегодня: по сделкам, закрытым в этот локальный день.
  const closedToday = (todayResult.data ?? []).filter(
    (t) =>
      t.status === "closed" &&
      t.closed_at &&
      new Date(t.closed_at as string) >= start &&
      new Date(t.closed_at as string) <= end,
  );
  let realizedToday: Maybe<Decimal> = known(ZERO);
  for (const t of closedToday) {
    const value = toDec(t.net_realized_account as string | null);
    if (value === null) {
      realizedToday = unknown("Итог одной из сегодняшних сделок неизвестен.");
      break;
    }
    if (realizedToday.known) realizedToday = known(add(realizedToday.value, value));
  }

  // Баланс на начало дня = текущий минус то, что изменило его сегодня.
  const flowsToday = (flowsResult.data ?? []).reduce((acc, f) => {
    const amount = toDec(String(f.amount));
    if (!amount) return acc;
    return f.kind === "deposit" ? add(acc, amount) : sub(acc, amount);
  }, ZERO);

  const balanceAtDayStart = realizedToday.known
    ? sub(sub(toDec(input.bookBalance) ?? ZERO, realizedToday.value), flowsToday)
    : null;

  const recent: SequenceTrade[] = (recentResult.data ?? []).map((t) => ({
    id: t.id as string,
    accountId: t.account_id as string,
    openedAt: new Date(t.opened_at as string),
    closedAt: t.closed_at ? new Date(t.closed_at as string) : null,
    netAccount: toDec(t.net_realized_account as string | null),
  }));

  const previousClosed =
    recent
      .filter((t) => t.closedAt && t.closedAt.getTime() < input.entryMoment.getTime())
      .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime())[0] ?? null;

  return {
    risk: input.risk,
    hasStop: input.hasStop,
    setupId: input.setupId,
    balanceAtEntry: input.balanceAtEntry,
    openRiskAccount: openRisk,
    realizedToday,
    balanceAtDayStart,
    entriesToday: (todayResult.data ?? []).length,
    previousClosed,
    lossStreak: lossStreakOf(recent),
    newsWindow: newsWindowStatus(
      (eventsResult.data ?? []) as EventRow[],
      input.instrumentId,
      input.entryMoment,
      input.newsWindowMinutes,
    ),
    entryMoment: input.entryMoment,
  };
}

interface EventRow {
  id: string;
  scheduled_at: string;
  instrument_id: string | null;
  market_code: string | null;
  currency: string | null;
}

/**
 * Попадает ли вход в окно важного события.
 *
 * Пустой календарь — это «неизвестно», а не «новостей не было». Календарь
 * заполняется вручную и заведомо неполон; выдавать его молчание за чистый фон
 * значило бы засчитывать проверку, которой не было.
 */
export function newsWindowStatus(
  events: EventRow[],
  instrumentId: string,
  at: Date,
  windowMinutes: number | null,
): "inside" | "outside" | "unknown" {
  if (windowMinutes === null) return "unknown";
  if (events.length === 0) return "unknown";

  const windowMs = windowMinutes * 60_000;
  const applicable = events.filter(
    (e) => e.instrument_id === null || e.instrument_id === instrumentId,
  );

  const inside = applicable.some(
    (e) => Math.abs(new Date(e.scheduled_at).getTime() - at.getTime()) <= windowMs,
  );
  return inside ? "inside" : "outside";
}
