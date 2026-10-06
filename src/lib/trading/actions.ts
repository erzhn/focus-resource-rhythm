"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { dec, isPositive, sub, toString, type Decimal } from "@/domain/trading/decimal";
import { localDate, isValidTimeZone } from "@/domain/trading/day";
import { checkPlan } from "@/domain/trading/plan";
import { finalR, initialRisk, plannedRR, realize } from "@/domain/trading/trade-math";
import type { FxSnapshot, Maybe, TradeEntry } from "@/domain/trading/types";
import { checkPartialClose, checkVolume } from "@/domain/trading/volume";
import {
  adjustmentFromRow,
  entryFromRow,
  exitFromRow,
  fromDec,
  specFromRow,
  type SpecRow,
  type TradeRow,
} from "./mappers";

/**
 * Серверные действия модуля «Торговля».
 *
 * Деньги считает ядро расчётов (src/domain/trading) — здесь только проверка
 * прав, валидация ввода и запись. Формулы не дублируются.
 *
 * Каждое действие заново проверяет пользователя: серверные функции доступны
 * прямым POST-запросом, а не только через интерфейс.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const fail = (error: string): ActionResult<never> => ({ ok: false, error });
const done = <T>(data: T): ActionResult<T> => ({ ok: true, data });

async function auth() {
  if (!isSupabaseConfigured) throw new Error("Модуль работает с базой: в демо-режиме он недоступен.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Нужно войти в аккаунт.");
  return { supabase, userId: user.id };
}

/** Десятичное число из поля формы. Пустая строка — это «не задано», а не ноль. */
function parseDecimal(raw: string | null | undefined, field: string): Decimal | null {
  const value = (raw ?? "").trim().replace(",", ".");
  if (!value) return null;
  try {
    return dec(value);
  } catch {
    throw new Error(`«${field}»: нужно десятичное число, например 4650.25`);
  }
}

function requirePositive(raw: string | null | undefined, field: string): Decimal {
  const d = parseDecimal(raw, field);
  if (d === null) throw new Error(`Заполните «${field}».`);
  if (!isPositive(d)) throw new Error(`«${field}» должно быть больше нуля.`);
  return d;
}

const guard = async <T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
  try {
    return await fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Не получилось выполнить действие.");
  }
};

// ---------------------------------------------------------------------------
// Счета
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  title: z.string().trim().min(1, "Назовите счёт."),
  broker: z.string().trim().optional(),
  currency: z.string().trim().min(2).max(10),
  openingBalance: z.string(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД."),
  timezone: z.string().trim().min(1),
  isDemo: z.boolean().optional(),
});

export async function createAccount(input: z.input<typeof accountSchema>): Promise<ActionResult<string>> {
  return guard(async () => {
    const { supabase, userId } = await auth();
    const parsed = accountSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;

    if (!isValidTimeZone(v.timezone)) {
      return fail(`Часовой пояс «${v.timezone}» не распознан.`);
    }
    const opening = parseDecimal(v.openingBalance, "Начальный баланс") ?? dec("0");

    const { data, error } = await supabase
      .from("trading_accounts")
      .insert({
        user_id: userId,
        title: v.title,
        broker: v.broker || null,
        currency: v.currency.toUpperCase(),
        opening_balance: toString(opening),
        opening_date: v.openingDate,
        timezone: v.timezone,
        is_demo: v.isDemo ?? false,
      })
      .select("id")
      .single();

    if (error) return fail(`Не удалось создать счёт: ${error.message}`);
    revalidatePath("/trading");
    return done(data.id as string);
  });
}

// ---------------------------------------------------------------------------
// Спецификации
// ---------------------------------------------------------------------------

const specSchema = z.object({
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  volumeUnit: z.enum(["lot", "share", "coin", "contract"]),
  quoteCurrency: z.string().trim().min(2).max(10),
  contractMultiplier: z.string(),
  minVolume: z.string(),
  volumeStep: z.string(),
  maxVolume: z.string().optional(),
  minCloseVolume: z.string(),
  minRemainingVolume: z.string(),
  priceStep: z.string(),
});

/**
 * Сохранение спецификации новой версией.
 *
 * Старые версии не редактируются: сделки ссылаются на снимок, и правка
 * множителя задним числом изменила бы их P/L.
 */
export async function saveSpec(input: z.input<typeof specSchema>): Promise<ActionResult<string>> {
  return guard(async () => {
    const { supabase, userId } = await auth();
    const parsed = specSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;

    const values = {
      contract_multiplier: toString(requirePositive(v.contractMultiplier, "Множитель контракта")),
      min_volume: toString(requirePositive(v.minVolume, "Минимальный объём")),
      volume_step: toString(requirePositive(v.volumeStep, "Шаг объёма")),
      min_close_volume: toString(requirePositive(v.minCloseVolume, "Минимальный объём закрытия")),
      min_remaining_volume: toString(requirePositive(v.minRemainingVolume, "Минимальный остаток")),
      price_step: toString(requirePositive(v.priceStep, "Шаг цены")),
      max_volume: fromDec(parseDecimal(v.maxVolume, "Максимальный объём")),
    };

    const { data: previous } = await supabase
      .from("trading_instrument_specs")
      .select("version")
      .eq("account_id", v.accountId)
      .eq("instrument_id", v.instrumentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("trading_instrument_specs")
      .insert({
        user_id: userId,
        account_id: v.accountId,
        instrument_id: v.instrumentId,
        version: (previous?.version ?? 0) + 1,
        calc_model: "linear",
        volume_unit: v.volumeUnit,
        quote_currency: v.quoteCurrency.toUpperCase(),
        is_configured: true,
        ...values,
      })
      .select("id")
      .single();

    if (error) return fail(`Не удалось сохранить спецификацию: ${error.message}`);
    revalidatePath("/trading/accounts");
    return done(data.id as string);
  });
}

// ---------------------------------------------------------------------------
// Общая подготовка сделки
// ---------------------------------------------------------------------------

interface Prepared {
  entry: TradeEntry;
  spec: SpecRow;
  account: { id: string; currency: string; timezone: string; book_balance: string };
  fx: FxSnapshot | null;
}

/**
 * Собирает снимок условий входа.
 *
 * Курс берётся так: если валюта котировки совпадает с валютой счёта, он равен
 * единице — это тождество, а не выдумка. Иначе нужен введённый курс; без него
 * денежные метрики останутся неизвестными.
 */
async function prepare(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  instrumentId: string,
  values: {
    direction: "long" | "short";
    entryPrice: Decimal;
    quantity: Decimal;
    initialStop: Decimal | null;
    target: Decimal | null;
    fxRate: Decimal | null;
    openedAt: Date;
    useBalance: boolean;
  },
): Promise<Prepared> {
  const { data: account, error: accErr } = await supabase
    .from("trading_accounts_v")
    .select("id, currency, timezone, book_balance")
    .eq("id", accountId)
    .maybeSingle();
  if (accErr || !account) throw new Error("Счёт не найден.");

  const { data: specRow, error: specErr } = await supabase
    .from("trading_instrument_specs_v")
    .select("*")
    .eq("account_id", accountId)
    .eq("instrument_id", instrumentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (specErr) throw new Error("Не удалось прочитать спецификацию.");
  if (!specRow) throw new Error("Для этого инструмента на счёте не настроена спецификация.");

  const spec = specFromRow(specRow as SpecRow);

  const sameCurrency = spec.quoteCurrency.toUpperCase() === String(account.currency).toUpperCase();
  const rate = sameCurrency ? dec("1") : values.fxRate;
  const fx: FxSnapshot | null = rate
    ? { rate, at: values.openedAt, source: "manual", estimated: !sameCurrency }
    : null;

  return {
    entry: {
      direction: values.direction,
      entryPrice: values.entryPrice,
      initialStop: values.initialStop,
      target: values.target,
      quantity: values.quantity,
      spec,
      fxAtEntry: fx,
      // Баланс на момент входа известен только для сделки, записываемой сейчас.
      // Для исторической записи он не восстанавливается: подставить сегодняшний
      // значило бы посчитать долю риска от неверной базы.
      balanceAtEntry: values.useBalance ? dec(String(account.book_balance)) : null,
    },
    spec: specRow as SpecRow,
    account: account as Prepared["account"],
    fx,
  };
}

const maybe = (m: Maybe<Decimal>): string | null => (m.known ? toString(m.value) : null);

/** Причина первого неизвестного значения — её и показываем рядом со сделкой. */
function reasonOf(...items: Maybe<Decimal>[]): string | null {
  const first = items.find((i) => !i.known);
  return first && !first.known ? first.reason : null;
}

// ---------------------------------------------------------------------------
// Проверка плана (ничего не записывает)
// ---------------------------------------------------------------------------

const planSchema = z.object({
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  direction: z.enum(["long", "short"]),
  entryPrice: z.string(),
  quantity: z.string(),
  initialStop: z.string().optional(),
  target: z.string().optional(),
  fxRate: z.string().optional(),
  riskBudget: z.string().optional(),
});

export interface PlanPreview {
  approved: boolean;
  issues: { code: string; message: string; severity: "block" | "warn" }[];
  riskAccount: string | null;
  riskPct: string | null;
  plannedRr: string | null;
  maxVolume: string | null;
  maxVolumeReason: string | null;
  quoteCurrency: string;
  accountCurrency: string;
  volumeUnit: string;
}

/**
 * Предварительная проверка. Сделки не создаёт: просмотр расчёта не является
 * входом в позицию.
 */
export async function previewPlan(input: z.input<typeof planSchema>): Promise<ActionResult<PlanPreview>> {
  return guard(async () => {
    const { supabase } = await auth();
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;

    const prepared = await prepare(supabase, v.accountId, v.instrumentId, {
      direction: v.direction,
      entryPrice: requirePositive(v.entryPrice, "Цена входа"),
      quantity: requirePositive(v.quantity, "Объём"),
      initialStop: parseDecimal(v.initialStop, "Стоп"),
      target: parseDecimal(v.target, "Цель"),
      fxRate: parseDecimal(v.fxRate, "Курс"),
      openedAt: new Date(),
      useBalance: true,
    });

    const budget = parseDecimal(v.riskBudget, "Лимит риска");
    const check = checkPlan(prepared.entry, { riskBudgetAccount: budget });
    const rr = plannedRR(prepared.entry);

    return done({
      approved: check.approved,
      issues: check.issues.map((i) => ({ code: i.code, message: i.message, severity: i.severity })),
      riskAccount: maybe(check.risk.riskAccount),
      riskPct: maybe(check.risk.riskPct),
      plannedRr: maybe(rr),
      maxVolume: check.maxVolume.known ? toString(check.maxVolume.value) : null,
      maxVolumeReason: check.maxVolume.known ? null : check.maxVolume.reason,
      quoteCurrency: prepared.spec.quote_currency,
      accountCurrency: prepared.account.currency,
      volumeUnit: prepared.spec.volume_unit,
    });
  });
}

// ---------------------------------------------------------------------------
// Запись факта входа
// ---------------------------------------------------------------------------

const recordSchema = planSchema.extend({
  openedAt: z.string().min(1, "Укажите время входа."),
  entryMode: z.enum(["planned", "historical"]),
  setupId: z.string().uuid().optional().or(z.literal("")),
  emotionBefore: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Записывает СОВЕРШЁННЫЙ вход.
 *
 * Пишется всегда — в том числе без стопа, с превышением лимита и во время
 * паузы. Нарушение фиксируется отдельно; сделка, оставшаяся вне журнала,
 * хуже сделки с пометкой.
 */
export async function recordTrade(input: z.input<typeof recordSchema>): Promise<ActionResult<string>> {
  return guard(async () => {
    const { supabase, userId } = await auth();
    const parsed = recordSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;

    const openedAt = new Date(v.openedAt);
    if (Number.isNaN(openedAt.getTime())) return fail("Время входа не распознано.");

    const quantity = requirePositive(v.quantity, "Объём");
    const prepared = await prepare(supabase, v.accountId, v.instrumentId, {
      direction: v.direction,
      entryPrice: requirePositive(v.entryPrice, "Цена входа"),
      quantity,
      initialStop: parseDecimal(v.initialStop, "Стоп"),
      target: parseDecimal(v.target, "Цель"),
      fxRate: parseDecimal(v.fxRate, "Курс"),
      openedAt,
      useBalance: v.entryMode === "planned",
    });

    const volume = checkVolume(quantity, prepared.entry.spec);
    if (!volume.ok) return fail(volume.reason!);

    const risk = initialRisk(prepared.entry);
    const rr = plannedRR(prepared.entry);
    const spec = prepared.spec;

    const { data, error } = await supabase
      .from("trades")
      .insert({
        user_id: userId,
        account_id: v.accountId,
        instrument_id: v.instrumentId,
        direction: v.direction,
        entry_price: toString(prepared.entry.entryPrice),
        quantity: toString(quantity),
        remaining_quantity: toString(quantity),
        opened_at: openedAt.toISOString(),
        initial_stop: fromDec(prepared.entry.initialStop),
        current_stop: fromDec(prepared.entry.initialStop),
        target: fromDec(prepared.entry.target),

        spec_id: spec.id,
        spec_version: spec.version,
        spec_calc_model: spec.calc_model,
        spec_volume_unit: spec.volume_unit,
        spec_contract_multiplier: spec.contract_multiplier,
        spec_quote_currency: spec.quote_currency,
        spec_volume_step: spec.volume_step,
        spec_min_close_volume: spec.min_close_volume,
        spec_min_remaining_volume: spec.min_remaining_volume,
        fx_at_entry: fromDec(prepared.fx?.rate ?? null),
        fx_at_entry_estimated: prepared.fx?.estimated ?? false,
        balance_at_entry: fromDec(prepared.entry.balanceAtEntry),
        balance_at_entry_source: v.entryMode === "planned" ? "computed" : "unknown",
        account_timezone: prepared.account.timezone,
        local_date: localDate(openedAt, prepared.account.timezone),

        initial_distance: maybe(risk.distance),
        initial_risk_quote: maybe(risk.riskQuote),
        initial_risk_account: maybe(risk.riskAccount),
        risk_pct: maybe(risk.riskPct),
        planned_rr: maybe(rr),
        gross_realized_account: null,
        net_realized_account: null,
        final_r: null,
        unknown_reason: reasonOf(risk.riskAccount, risk.riskPct),

        entry_mode: v.entryMode,
        source: "web",
        setup_id: v.setupId || null,
        emotion_before: v.emotionBefore || null,
        notes: v.notes || null,
        checked_at: v.entryMode === "planned" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) return fail(`Не удалось записать сделку: ${error.message}`);
    revalidatePath("/trading");
    revalidatePath("/trading/trades");
    return done(data.id as string);
  });
}

// ---------------------------------------------------------------------------
// Выход
// ---------------------------------------------------------------------------

const exitSchema = z.object({
  tradeId: z.string().uuid(),
  quantity: z.string(),
  price: z.string(),
  exitedAt: z.string().min(1),
  reason: z.string().optional(),
  fxRate: z.string().optional(),
  actionKey: z.string().min(8).optional(),
});

/**
 * Запись выхода.
 *
 * Состояние считается на сервере, записывается под блокировкой сделки.
 * Если между расчётом и записью остаток изменился (параллельный выход),
 * функция в базе откажет, и мы пересчитываем один раз заново — так два
 * одновременных запроса не могут закрыть один остаток дважды.
 */
export async function addExit(input: z.input<typeof exitSchema>): Promise<ActionResult<{ closed: boolean }>> {
  return guard(async () => {
    const { supabase } = await auth();
    const parsed = exitSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;

    const actionKey = v.actionKey ?? randomUUID();
    let lastError = "";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await attemptExit(supabase, v, actionKey);
      if (result.ok) {
        revalidatePath("/trading");
        revalidatePath(`/trading/trades/${v.tradeId}`);
        return result;
      }
      lastError = result.error;
      if (!lastError.includes("Остаток изменился")) return fail(lastError);
    }
    return fail(`${lastError} Попробуйте ещё раз.`);
  });
}

async function attemptExit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  v: z.infer<typeof exitSchema>,
  actionKey: string,
): Promise<ActionResult<{ closed: boolean }>> {
  const { data: row, error } = await supabase
    .from("trading_trades_v")
    .select("*")
    .eq("id", v.tradeId)
    .maybeSingle();
  if (error || !row) return fail("Сделка не найдена.");

  const trade = row as TradeRow;
  if (trade.status === "voided") return fail("Сделка аннулирована.");

  const entry = entryFromRow(trade);
  const quantity = requirePositive(v.quantity, "Объём закрытия");
  const price = requirePositive(v.price, "Цена выхода");
  const exitedAt = new Date(v.exitedAt);
  if (Number.isNaN(exitedAt.getTime())) return fail("Время выхода не распознано.");

  const remainingBefore = dec(trade.remaining_quantity);
  const allowed = checkPartialClose(quantity, remainingBefore, entry.spec);
  if (!allowed.ok) return fail(allowed.reason!);

  const { data: existing } = await supabase
    .from("trade_exits_v")
    .select("*")
    .eq("trade_id", v.tradeId)
    .order("exited_at");

  const sameCurrency = trade.spec_quote_currency.toUpperCase() === trade.account_currency.toUpperCase();
  const rate = sameCurrency ? dec("1") : parseDecimal(v.fxRate, "Курс");
  const newExit = {
    quantity,
    price,
    at: exitedAt,
    fx: rate ? { rate, at: exitedAt, source: "manual" as const, estimated: !sameCurrency } : null,
  };

  const allExits = [...((existing ?? []) as { quantity: string; price: string; exited_at: string; fx_rate: string | null; fx_estimated: boolean; id: string; trade_id: string; reason: string | null; action_key: string }[]).map(exitFromRow), newExit];

  const { data: adjRows } = await supabase
    .from("trade_cash_adjustments")
    .select("id, trade_id, kind, amount_account, posted_at")
    .eq("trade_id", v.tradeId);
  const adjustments = (adjRows ?? [])
    .map((a) => adjustmentFromRow({ ...a, amount_account: a.amount_account === null ? null : String(a.amount_account) }))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const realized = realize(entry, allExits, adjustments);
  const remainingAfter = sub(remainingBefore, quantity);
  const result = realized.closed ? finalR(entry, realized) : null;

  const { data: rpc, error: rpcError } = await supabase.rpc("record_trade_exit", {
    p_trade_id: v.tradeId,
    p_quantity: toString(quantity),
    p_price: toString(price),
    p_exited_at: exitedAt.toISOString(),
    p_action_key: actionKey,
    p_expected_remaining: trade.remaining_quantity,
    p_new_remaining: toString(remainingAfter),
    p_gross_realized_account: maybe(realized.grossAccount),
    p_net_realized_account: maybe(realized.netAccount),
    p_final_r: result ? maybe(result) : null,
    p_avg_exit_price: maybe(realized.avgExitPrice),
    p_unknown_reason: realized.netAccount.known ? null : realized.netAccount.reason,
    p_reason: v.reason || null,
    p_fx_rate: fromDec(rate),
    p_fx_estimated: !sameCurrency,
  });

  if (rpcError) return fail(rpcError.message);
  const first = Array.isArray(rpc) ? rpc[0] : rpc;
  return done({ closed: Boolean(first?.closed) });
}

// ---------------------------------------------------------------------------
// Перенос стопа
// ---------------------------------------------------------------------------

const stopSchema = z.object({
  tradeId: z.string().uuid(),
  newStop: z.string(),
  reason: z.string().optional(),
});

/**
 * Перенос стопа.
 *
 * Меняется только current_stop. initial_stop и посчитанный от него риск
 * остаются прежними: иначе «перевёл в безубыток» задним числом превращало бы
 * историю в вымысел.
 */
export async function moveStop(input: z.input<typeof stopSchema>): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const { supabase, userId } = await auth();
    const parsed = stopSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;

    const newStop = requirePositive(v.newStop, "Новый стоп");
    const { data: row } = await supabase
      .from("trading_trades_v")
      .select("id, current_stop, status")
      .eq("id", v.tradeId)
      .maybeSingle();
    if (!row) return fail("Сделка не найдена.");
    if (row.status !== "open") return fail("Сделка закрыта — стоп уже не действует.");

    const { error } = await supabase
      .from("trades")
      .update({ current_stop: toString(newStop) })
      .eq("id", v.tradeId);
    if (error) return fail(`Не удалось перенести стоп: ${error.message}`);

    await supabase.from("trade_events").insert({
      user_id: userId,
      trade_id: v.tradeId,
      kind: "stop_moved",
      from_value: row.current_stop,
      to_value: toString(newStop),
      reason: v.reason || null,
      author: "web",
    });

    revalidatePath(`/trading/trades/${v.tradeId}`);
    return done(undefined);
  });
}

// ---------------------------------------------------------------------------
// Движение денег
// ---------------------------------------------------------------------------

const cashSchema = z.object({
  accountId: z.string().uuid(),
  kind: z.enum(["deposit", "withdrawal"]),
  amount: z.string(),
  occurredAt: z.string().min(1),
  note: z.string().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

/** Пополнение или вывод. Прибылью не является и в торговый результат не входит. */
export async function addCashFlow(input: z.input<typeof cashSchema>): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const { supabase, userId } = await auth();
    const parsed = cashSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;

    const amount = requirePositive(v.amount, "Сумма");
    const occurredAt = new Date(v.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return fail("Дата не распознана.");

    const { error } = await supabase.from("trading_cash_flows").insert({
      user_id: userId,
      account_id: v.accountId,
      kind: v.kind,
      amount: toString(amount),
      occurred_at: occurredAt.toISOString(),
      note: v.note || null,
      idempotency_key: v.idempotencyKey ?? randomUUID(),
    });

    // Повтор с тем же ключом — не ошибка пользователя, а защита от дубля.
    if (error && error.code === "23505") return done(undefined);
    if (error) return fail(`Не удалось записать движение денег: ${error.message}`);

    revalidatePath("/trading");
    revalidatePath("/trading/accounts");
    return done(undefined);
  });
}
