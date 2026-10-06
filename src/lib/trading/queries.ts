import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { AdjustmentRow, ExitRow, SpecRow, TradeRow } from "./mappers";

/**
 * Чтение данных модуля «Торговля».
 *
 * Всё читается на сервере и уже отфильтрованным: выгружать историю сделок в
 * браузер ради подсчёта показателей нельзя — она растёт, а телефон не резиновый.
 *
 * Денежные поля приходят из представлений текстом (см. mappers.ts).
 */

export interface AccountRow {
  id: string;
  title: string;
  broker: string | null;
  currency: string;
  opening_date: string;
  timezone: string;
  is_demo: boolean;
  archived_at: string | null;
  open_trades: number;
  closed_trades: number;
  unknown_result_trades: number;
  opening_balance: string;
  net_cash_flow: string;
  cumulative_trading_pnl: string;
  reconciliation_total: string;
  book_balance: string;
}

export interface InstrumentRow {
  id: string;
  market_code: string;
  code: string;
  display_name: string;
  quote_currency: string;
  product_type: string;
  aliases: string[];
  user_id: string | null;
}

export interface MarketRow {
  code: string;
  title: string;
  sort_order: number;
}

/** В демо-режиме (без ключей Supabase) модуль недоступен: он работает с базой. */
export const tradingAvailable = isSupabaseConfigured;

async function client() {
  return createClient();
}

export async function listAccounts(): Promise<AccountRow[]> {
  if (!tradingAvailable) return [];
  const sb = await client();
  const { data, error } = await sb
    .from("trading_accounts_v")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Не удалось загрузить счета: ${error.message}`);
  return (data ?? []) as AccountRow[];
}

export async function getAccount(id: string): Promise<AccountRow | null> {
  if (!tradingAvailable) return null;
  const sb = await client();
  const { data, error } = await sb.from("trading_accounts_v").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Не удалось загрузить счёт: ${error.message}`);
  return (data as AccountRow) ?? null;
}

export async function listMarkets(): Promise<MarketRow[]> {
  if (!tradingAvailable) return [];
  const sb = await client();
  const { data, error } = await sb.from("trading_markets").select("*").order("sort_order");
  if (error) throw new Error(`Не удалось загрузить рынки: ${error.message}`);
  return (data ?? []) as MarketRow[];
}

/**
 * Инструменты рынка. Общие записи справочника видны всем, свои — только
 * владельцу; это обеспечивается политикой RLS, а не фильтром здесь.
 */
export async function listInstruments(marketCode?: string): Promise<InstrumentRow[]> {
  if (!tradingAvailable) return [];
  const sb = await client();
  let q = sb.from("trading_instruments").select("*").is("archived_at", null);
  if (marketCode) q = q.eq("market_code", marketCode);
  const { data, error } = await q.order("code");
  if (error) throw new Error(`Не удалось загрузить инструменты: ${error.message}`);
  return (data ?? []) as InstrumentRow[];
}

export async function listSpecs(accountId: string): Promise<SpecRow[]> {
  if (!tradingAvailable) return [];
  const sb = await client();
  const { data, error } = await sb
    .from("trading_instrument_specs_v")
    .select("*")
    .eq("account_id", accountId)
    .order("instrument_code");
  if (error) throw new Error(`Не удалось загрузить спецификации: ${error.message}`);
  return (data ?? []) as SpecRow[];
}

/** Текущая (наибольшая) версия спецификации инструмента на счёте. */
export async function getCurrentSpec(
  accountId: string,
  instrumentId: string,
): Promise<SpecRow | null> {
  if (!tradingAvailable) return null;
  const sb = await client();
  const { data, error } = await sb
    .from("trading_instrument_specs_v")
    .select("*")
    .eq("account_id", accountId)
    .eq("instrument_id", instrumentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Не удалось загрузить спецификацию: ${error.message}`);
  return (data as SpecRow) ?? null;
}

export interface TradeFilters {
  accountId: string;
  status?: "open" | "closed";
  marketCode?: string;
  instrumentId?: string;
  direction?: "long" | "short";
  from?: string;
  to?: string;
  search?: string;
}

export interface TradePage {
  rows: TradeRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Список сделок со СЕРВЕРНОЙ пагинацией и фильтрами.
 * Счётчик берётся тем же запросом: отдельный count разъехался бы с выборкой.
 */
export async function listTrades(
  filters: TradeFilters,
  page = 1,
  pageSize = 25,
): Promise<TradePage> {
  if (!tradingAvailable) return { rows: [], total: 0, page, pageSize };
  const sb = await client();

  let q = sb
    .from("trading_trades_v")
    .select("*", { count: "exact" })
    .eq("account_id", filters.accountId)
    .neq("status", "voided");

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.marketCode) q = q.eq("market_code", filters.marketCode);
  if (filters.instrumentId) q = q.eq("instrument_id", filters.instrumentId);
  if (filters.direction) q = q.eq("direction", filters.direction);
  if (filters.from) q = q.gte("local_date", filters.from);
  if (filters.to) q = q.lte("local_date", filters.to);
  if (filters.search) {
    const safe = filters.search.replace(/[%,()]/g, " ").trim();
    if (safe) q = q.or(`notes.ilike.%${safe}%,lesson.ilike.%${safe}%,instrument_code.ilike.%${safe}%`);
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await q
    .order("opened_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(`Не удалось загрузить сделки: ${error.message}`);
  return { rows: (data ?? []) as TradeRow[], total: count ?? 0, page, pageSize };
}

export interface TradeDetail {
  trade: TradeRow;
  exits: ExitRow[];
  adjustments: AdjustmentRow[];
  events: {
    id: string;
    kind: string;
    occurred_at: string;
    from_value: string | null;
    to_value: string | null;
    reason: string | null;
    author: string;
  }[];
}

export async function getTrade(id: string): Promise<TradeDetail | null> {
  if (!tradingAvailable) return null;
  const sb = await client();

  const { data: trade, error } = await sb
    .from("trading_trades_v")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Не удалось загрузить сделку: ${error.message}`);
  if (!trade) return null;

  const [exits, adjustments, events] = await Promise.all([
    sb.from("trade_exits_v").select("*").eq("trade_id", id).order("exited_at"),
    sb
      .from("trade_cash_adjustments")
      .select("id, trade_id, kind, amount_account, posted_at")
      .eq("trade_id", id)
      .order("posted_at"),
    // Для одинаковых времён сортировка дополняется id — иначе порядок
    // событий мог бы меняться от запроса к запросу.
    sb
      .from("trade_events")
      .select("id, kind, occurred_at, from_value, to_value, reason, author")
      .eq("trade_id", id)
      .order("occurred_at")
      .order("id"),
  ]);

  return {
    trade: trade as TradeRow,
    exits: (exits.data ?? []) as ExitRow[],
    adjustments: (adjustments.data ?? []).map((a) => ({
      ...a,
      amount_account: a.amount_account === null ? null : String(a.amount_account),
    })) as AdjustmentRow[],
    events: (events.data ?? []).map((e) => ({
      ...e,
      from_value: e.from_value === null ? null : String(e.from_value),
      to_value: e.to_value === null ? null : String(e.to_value),
    })) as TradeDetail["events"],
  };
}

/** Открытые позиции счёта — для обзора и для выбора в боте. */
export async function listOpenTrades(accountId: string): Promise<TradeRow[]> {
  const { rows } = await listTrades({ accountId, status: "open" }, 1, 50);
  return rows;
}
