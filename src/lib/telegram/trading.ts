import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dec, isPositive, sub, toString, type Decimal } from "@/domain/trading/decimal";
import { localDate } from "@/domain/trading/day";
import { checkPlan } from "@/domain/trading/plan";
import { finalR, initialRisk, realize } from "@/domain/trading/trade-math";
import { checkPartialClose, checkVolume } from "@/domain/trading/volume";
import {
  DIRECTION_LABELS,
  formatMoney,
  formatPrice,
  formatQuantity,
  formatR,
} from "@/domain/trading/format";
import type { TradingCommand } from "@/domain/trading/telegram";
import type { FxSnapshot, Maybe, TradeEntry } from "@/domain/trading/types";
import { adjustmentFromRow, entryFromRow, exitFromRow, specFromRow, type SpecRow, type TradeRow } from "@/lib/trading/mappers";

/**
 * Торговые команды бота.
 *
 * Вебхук работает под service-role и обходит RLS, поэтому КАЖДЫЙ запрос здесь
 * явно фильтруется по user_id. Полагаться на политики нельзя: для этого
 * соединения их нет.
 *
 * Деньги считает то же ядро, что и сайт. Бот не имеет своей арифметики, иначе
 * «записал в боте» и «посмотрел на сайте» однажды разошлись бы.
 */

type Db = SupabaseClient;

const maybe = (m: Maybe<Decimal>): string | null => (m.known ? toString(m.value) : null);

interface AccountRow {
  id: string;
  title: string;
  currency: string;
  timezone: string;
  book_balance: string;
  is_demo: boolean;
}

/** Активный счёт: пока он один — он и активный, иначе нужен явный выбор. */
async function activeAccount(sb: Db, userId: string): Promise<AccountRow | string> {
  const { data } = await sb
    .from("trading_accounts_v")
    .select("id, title, currency, timezone, book_balance, is_demo")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at");

  const rows = (data ?? []) as AccountRow[];
  if (rows.length === 0) {
    return "Торгового счёта пока нет. Создайте его в приложении: Торговля → Счета.";
  }
  const { data: session } = await sb
    .from("telegram_sessions")
    .select("account_id")
    .eq("user_id", userId)
    .maybeSingle();

  const chosen = rows.find((r) => r.id === session?.account_id);
  return chosen ?? rows[0];
}

export async function handleTradingCommand(
  sb: Db,
  userId: string,
  chatId: number,
  command: TradingCommand,
): Promise<string> {
  const account = await activeAccount(sb, userId);
  if (typeof account === "string") return account;

  switch (command.type) {
    case "balance":
      return balanceText(account);
    case "account":
      return await chooseAccount(sb, userId, chatId, command.account);
    case "open":
    case "trades":
      return await openPositions(sb, userId, account);
    case "in":
    case "log":
      return await recordFromBot(sb, userId, account, command);
    case "out":
      return await closeRemaining(sb, userId, account, command.price, command.problems);
    case "partial":
      return await closePartial(sb, userId, account, command);
    case "stop":
      return await moveStopFromBot(sb, userId, account, command.price, command.problems);
  }
}

function balanceText(account: AccountRow): string {
  return [
    `<b>${account.title}</b>${account.is_demo ? " (демо)" : ""}`,
    `Учётный баланс: ${formatMoney(account.book_balance, account.currency)}`,
    "",
    "Это капитал журнала: начальный баланс плюс внешние потоки и реализованный результат.",
    "Свободными средствами у брокера он не является.",
  ].join("\n");
}

async function chooseAccount(sb: Db, userId: string, chatId: number, query?: string): Promise<string> {
  const { data } = await sb
    .from("trading_accounts_v")
    .select("id, title, currency, book_balance")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at");
  const rows = (data ?? []) as { id: string; title: string; currency: string; book_balance: string }[];

  if (!query) {
    return [
      "Счета:",
      ...rows.map((r) => `• ${r.title} — ${formatMoney(r.book_balance, r.currency)}`),
      "",
      "Выбрать: /account НАЗВАНИЕ",
    ].join("\n");
  }

  const found = rows.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()));
  if (found.length === 0) return `Счёт «${query}» не найден.`;
  if (found.length > 1) {
    return `Под «${query}» подходит несколько счетов: ${found.map((f) => f.title).join(", ")}. Уточните.`;
  }

  await sb.from("telegram_sessions").upsert(
    { chat_id: chatId, user_id: userId, account_id: found[0].id, flow: null, step: null },
    { onConflict: "chat_id" },
  );
  return `Активный счёт — ${found[0].title}.`;
}

async function openPositions(sb: Db, userId: string, account: AccountRow): Promise<string> {
  const { data } = await sb
    .from("trading_trades_v")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", account.id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as TradeRow[];
  if (rows.length === 0) return "Открытых позиций нет.";

  return [
    `<b>Открытые позиции — ${account.title}</b>`,
    "",
    ...rows.map((t, i) =>
      [
        `${i + 1}. ${t.instrument_code} ${DIRECTION_LABELS[t.direction]}`,
        `   вход ${formatPrice(t.entry_price)}, остаток ${formatQuantity(t.remaining_quantity, t.spec_volume_unit)}`,
        `   стоп ${t.current_stop ? formatPrice(t.current_stop) : "не задан"}`,
      ].join("\n"),
    ),
    "",
    rows.length === 1
      ? "Закрыть: /out ЦЕНА · Перенести стоп: /stop ЦЕНА"
      : "Команды /out, /partial и /stop работают, когда открыта одна позиция. Иначе действуйте в приложении.",
  ].join("\n");
}

/** Единственная открытая позиция или объяснение, почему команда не применима. */
async function singleOpen(
  sb: Db,
  userId: string,
  account: AccountRow,
): Promise<TradeRow | string> {
  const { data } = await sb
    .from("trading_trades_v")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", account.id)
    .eq("status", "open");

  const rows = (data ?? []) as TradeRow[];
  if (rows.length === 0) return "Открытых позиций нет.";
  if (rows.length > 1) {
    return "Открыто несколько позиций — выберите нужную в приложении: бот не должен угадывать, какую вы имели в виду.";
  }
  return rows[0];
}

async function recordFromBot(
  sb: Db,
  userId: string,
  account: AccountRow,
  command: Extract<TradingCommand, { type: "in" | "log" }>,
): Promise<string> {
  if (command.problems.length > 0) {
    return [
      "Не хватает данных:",
      ...command.problems.map((p) => `• ${p}`),
      "",
      "Пример: /in XAUUSD buy 4650 sl 4632 tp 4700 0.01",
    ].join("\n");
  }

  const { symbol, direction, entry, stop, target, quantity } = command.input;

  const { data: instruments } = await sb
    .from("trading_instruments")
    .select("id, code, display_name")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .ilike("code", symbol!);

  const found = (instruments ?? []) as { id: string; code: string; display_name: string }[];
  if (found.length === 0) return `Инструмент «${symbol}» не найден в справочнике.`;
  if (found.length > 1) {
    return `Под «${symbol}» подходит несколько инструментов: ${found.map((f) => f.code).join(", ")}. Уточните.`;
  }
  const instrument = found[0];

  const { data: specRow } = await sb
    .from("trading_instrument_specs_v")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", account.id)
    .eq("instrument_id", instrument.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!specRow) {
    return `Для ${instrument.code} на счёте «${account.title}» не настроена спецификация. Настройте её в приложении — без множителя контракта риск считать не из чего.`;
  }
  const spec = specFromRow(specRow as SpecRow);
  const sameCurrency = spec.quoteCurrency.toUpperCase() === account.currency.toUpperCase();

  const openedAt = new Date();
  const fx: FxSnapshot | null = sameCurrency
    ? { rate: dec("1"), at: openedAt, source: "manual", estimated: false }
    : null;

  const tradeEntry: TradeEntry = {
    direction: direction!,
    entryPrice: dec(entry!),
    initialStop: stop ? dec(stop) : null,
    target: target ? dec(target) : null,
    quantity: dec(quantity!),
    spec,
    fxAtEntry: fx,
    balanceAtEntry: command.type === "in" ? dec(account.book_balance) : null,
  };

  const volume = checkVolume(tradeEntry.quantity, spec);
  if (!volume.ok) return volume.reason!;

  const check = checkPlan(tradeEntry, { riskBudgetAccount: null });
  const risk = initialRisk(tradeEntry);

  // /in проверяет план и отказывает при блокирующем нарушении.
  // /log пишет факт всегда: сделка вне журнала хуже сделки с пометкой.
  if (command.type === "in" && !check.approved) {
    return [
      "План не одобрен:",
      ...check.issues.filter((i) => i.severity === "block").map((i) => `• ${i.message}`),
      "",
      "Если вход уже совершён, запишите его как есть: замените /in на /log.",
    ].join("\n");
  }

  const { data: inserted, error } = await sb
    .from("trades")
    .insert({
      user_id: userId,
      account_id: account.id,
      instrument_id: instrument.id,
      direction: direction,
      entry_price: entry,
      quantity,
      remaining_quantity: quantity,
      opened_at: openedAt.toISOString(),
      initial_stop: stop,
      current_stop: stop,
      target,
      spec_id: (specRow as SpecRow).id,
      spec_version: (specRow as SpecRow).version,
      spec_calc_model: (specRow as SpecRow).calc_model,
      spec_volume_unit: (specRow as SpecRow).volume_unit,
      spec_contract_multiplier: (specRow as SpecRow).contract_multiplier,
      spec_quote_currency: (specRow as SpecRow).quote_currency,
      spec_volume_step: (specRow as SpecRow).volume_step,
      spec_min_close_volume: (specRow as SpecRow).min_close_volume,
      spec_min_remaining_volume: (specRow as SpecRow).min_remaining_volume,
      fx_at_entry: fx ? toString(fx.rate) : null,
      balance_at_entry: command.type === "in" ? account.book_balance : null,
      balance_at_entry_source: command.type === "in" ? "computed" : "unknown",
      account_timezone: account.timezone,
      local_date: localDate(openedAt, account.timezone),
      initial_distance: maybe(risk.distance),
      initial_risk_quote: maybe(risk.riskQuote),
      initial_risk_account: maybe(risk.riskAccount),
      risk_pct: maybe(risk.riskPct),
      entry_mode: command.type === "in" ? "planned" : "historical",
      source: "telegram",
      checked_at: command.type === "in" ? openedAt.toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("telegram: запись сделки не удалась", error);
    return "Не получилось записать сделку. Попробуйте ещё раз.";
  }

  const warnings = check.issues.filter((i) => i.severity === "warn").map((i) => `⚠️ ${i.message}`);

  return [
    `Факт входа записан: <b>${instrument.code}</b> ${DIRECTION_LABELS[direction!]}`,
    `Вход ${formatPrice(entry)}, объём ${formatQuantity(quantity, spec.volumeUnit)}`,
    stop ? `Стоп ${formatPrice(stop)}` : "⚠️ Стоп не задан — исходный риск неизвестен",
    risk.riskAccount.known
      ? `Риск до стопа: ${formatMoney(maybe(risk.riskAccount), account.currency)}`
      : "Риск не рассчитан: " + (risk.riskAccount.known ? "" : risk.riskAccount.reason),
    ...warnings,
    "",
    `Запись в приложении: /trading/trades/${inserted.id}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function closeRemaining(
  sb: Db,
  userId: string,
  account: AccountRow,
  price: string | null,
  problems: string[],
): Promise<string> {
  if (problems.length > 0) return problems.join("\n");
  if (!price) return "Укажите цену выхода: /out 4700";

  const trade = await singleOpen(sb, userId, account);
  if (typeof trade === "string") return trade;

  return await writeExit(sb, userId, account, trade, trade.remaining_quantity, price);
}

async function closePartial(
  sb: Db,
  userId: string,
  account: AccountRow,
  command: Extract<TradingCommand, { type: "partial" }>,
): Promise<string> {
  if (command.problems.length > 0) return command.problems.join("\n");

  const trade = await singleOpen(sb, userId, account);
  if (typeof trade === "string") return trade;

  return await writeExit(sb, userId, account, trade, command.quantity!, command.price!);
}

async function writeExit(
  sb: Db,
  userId: string,
  account: AccountRow,
  trade: TradeRow,
  quantityRaw: string,
  priceRaw: string,
): Promise<string> {
  const entry = entryFromRow(trade);
  const quantity = dec(quantityRaw);
  const price = dec(priceRaw);
  if (!isPositive(quantity) || !isPositive(price)) return "Объём и цена должны быть больше нуля.";

  const remainingBefore = dec(trade.remaining_quantity);
  const allowed = checkPartialClose(quantity, remainingBefore, entry.spec);
  if (!allowed.ok) return allowed.reason!;

  const sameCurrency = trade.spec_quote_currency.toUpperCase() === account.currency.toUpperCase();
  if (!sameCurrency) {
    return "У этой сделки валюта инструмента отличается от валюты счёта: курс выхода нужно указать в приложении, иначе итог останется неизвестным.";
  }

  const [{ data: exitRows }, { data: adjRows }] = await Promise.all([
    sb.from("trade_exits_v").select("*").eq("trade_id", trade.id).order("exited_at"),
    sb
      .from("trade_cash_adjustments")
      .select("id, trade_id, kind, amount_account, posted_at")
      .eq("trade_id", trade.id),
  ]);

  const exitedAt = new Date();
  const allExits = [
    ...((exitRows ?? []) as Parameters<typeof exitFromRow>[0][]).map(exitFromRow),
    { quantity, price, at: exitedAt, fx: { rate: dec("1"), at: exitedAt, source: "manual" as const, estimated: false } },
  ];
  const adjustments = ((adjRows ?? []) as { id: string; trade_id: string; kind: "commission" | "swap" | "funding" | "other"; amount_account: unknown; posted_at: string }[])
    .map((a) => adjustmentFromRow({ ...a, amount_account: a.amount_account === null ? null : String(a.amount_account) }))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const realized = realize(entry, allExits, adjustments);
  const remainingAfter = sub(remainingBefore, quantity);
  const result = realized.closed ? finalR(entry, realized) : null;

  const { error } = await sb.rpc("record_trade_exit", {
    p_trade_id: trade.id,
    p_quantity: toString(quantity),
    p_price: toString(price),
    p_exited_at: exitedAt.toISOString(),
    p_action_key: `tg-${randomUUID()}`,
    p_expected_remaining: trade.remaining_quantity,
    p_new_remaining: toString(remainingAfter),
    p_gross_realized_account: maybe(realized.grossAccount),
    p_net_realized_account: maybe(realized.netAccount),
    p_final_r: result ? maybe(result) : null,
    p_avg_exit_price: maybe(realized.avgExitPrice),
    p_unknown_reason: realized.netAccount.known ? null : realized.netAccount.reason,
    p_reason: "через бота",
    p_fx_rate: "1",
    p_fx_estimated: false,
  });

  if (error) {
    if (error.message.includes("Остаток изменился")) {
      return "Остаток изменился, пока записывался выход. Повторите команду — данные уже обновились.";
    }
    console.error("telegram: запись выхода не удалась", error);
    return "Не получилось записать выход.";
  }

  const closed = !isPositive(remainingAfter);
  return [
    closed ? "Позиция закрыта." : "Частичное закрытие записано.",
    `${trade.instrument_code}: ${formatQuantity(toString(quantity), trade.spec_volume_unit)} по ${formatPrice(toString(price))}`,
    `Результат: ${formatMoney(maybe(realized.netAccount), account.currency, { signed: true })}`,
    closed && result ? `Итог: ${formatR(maybe(result))}` : null,
    closed ? null : `Остаток: ${formatQuantity(toString(remainingAfter), trade.spec_volume_unit)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function moveStopFromBot(
  sb: Db,
  userId: string,
  account: AccountRow,
  price: string | null,
  problems: string[],
): Promise<string> {
  if (problems.length > 0) return problems.join("\n");
  if (!price) return "Укажите новую цену стопа: /stop 4650";

  const trade = await singleOpen(sb, userId, account);
  if (typeof trade === "string") return trade;

  const { error } = await sb.from("trades").update({ current_stop: price }).eq("id", trade.id);
  if (error) return "Не получилось перенести стоп.";

  await sb.from("trade_events").insert({
    user_id: userId,
    trade_id: trade.id,
    kind: "stop_moved",
    from_value: trade.current_stop,
    to_value: price,
    reason: "через бота",
    author: "telegram",
  });

  return [
    `Стоп перенесён: ${trade.current_stop ? formatPrice(trade.current_stop) : "не был задан"} → ${formatPrice(price)}`,
    "",
    "Исходный стоп и начальный риск не изменились — от них считаются все R.",
  ].join("\n");
}
