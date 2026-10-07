import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { dec } from "@/domain/trading/decimal";
import { exitResultAccount } from "@/domain/trading/trade-math";
import type { AnalyticsTrade, Posting } from "@/domain/trading/analytics";
import {
  adjustmentFromRow,
  entryFromRow,
  exitFromRow,
  toDec,
  type AdjustmentRow,
  type ExitRow,
  type TradeRow,
} from "./mappers";

/**
 * Данные для аналитики.
 *
 * Выборка собирается на СЕРВЕРЕ и приходит в представление уже готовой:
 * выгружать историю сделок в браузер ради подсчёта средних нельзя — она
 * растёт, а телефон не резиновый.
 *
 * Денежные проводки восстанавливаются из выходов и расходов тем же ядром
 * расчётов, что считает сделку. Поэтому «P/L за период» и «итог сделки»
 * получаются из одной формулы и не могут разойтись.
 */

/** Потолок выборки. При его достижении интерфейс обязан сказать об этом. */
export const MAX_TRADES = 2000;
export const MAX_EXITS = 8000;

export interface AnalyticsData {
  trades: AnalyticsTrade[];
  postings: Posting[];
  /** Валюта счёта: все денежные величины приведены к ней. */
  currency: string;
  /** Данных больше, чем влезло в выборку. */
  truncated: boolean;
  /** Сколько сделок не попало в денежные проводки из-за неизвестного курса. */
  postingsUnknown: number;
}

export async function loadAnalytics(accountId: string, currency: string): Promise<AnalyticsData> {
  if (!isSupabaseConfigured) {
    return { trades: [], postings: [], currency, truncated: false, postingsUnknown: 0 };
  }

  const sb = await createClient();

  const [tradesResult, exitsResult, adjustmentsResult] = await Promise.all([
    sb
      .from("trading_trades_v")
      .select("*")
      .eq("account_id", accountId)
      .neq("status", "voided")
      .order("opened_at", { ascending: false })
      .limit(MAX_TRADES),
    sb
      .from("trade_exits_v")
      .select("*")
      .order("exited_at", { ascending: false })
      .limit(MAX_EXITS),
    sb
      .from("trade_cash_adjustments")
      .select("id, trade_id, kind, amount_account, posted_at")
      .order("posted_at", { ascending: false })
      .limit(MAX_EXITS),
  ]);

  const rows = (tradesResult.data ?? []) as TradeRow[];
  const byTrade = new Set(rows.map((t) => t.id));

  const exits = ((exitsResult.data ?? []) as ExitRow[]).filter((e) => byTrade.has(e.trade_id));
  const adjustments = ((adjustmentsResult.data ?? []) as { id: string; trade_id: string; kind: AdjustmentRow["kind"]; amount_account: unknown; posted_at: string }[])
    .filter((a) => byTrade.has(a.trade_id))
    .map((a) => ({ ...a, amount_account: a.amount_account === null ? null : String(a.amount_account) }));

  const exitsByTrade = new Map<string, ExitRow[]>();
  for (const e of exits) {
    const list = exitsByTrade.get(e.trade_id) ?? [];
    list.push(e);
    exitsByTrade.set(e.trade_id, list);
  }

  const postings: Posting[] = [];
  let postingsUnknown = 0;

  for (const row of rows) {
    const entry = entryFromRow(row);
    for (const exitRow of exitsByTrade.get(row.id) ?? []) {
      const amount = exitResultAccount(entry, exitFromRow(exitRow));
      if (!amount.known) {
        // Неизвестный курс — проводки нет. Подставить ноль значило бы
        // записать выход как безрезультатный.
        postingsUnknown += 1;
        continue;
      }
      postings.push({ at: new Date(exitRow.exited_at), amount: amount.value, tradeId: row.id });
    }
  }

  for (const a of adjustments) {
    const parsed = adjustmentFromRow(a as AdjustmentRow);
    if (!parsed) {
      postingsUnknown += 1;
      continue;
    }
    postings.push({ at: parsed.at, amount: parsed.amountAccount, tradeId: a.trade_id });
  }

  return {
    trades: rows.map(toAnalyticsTrade),
    postings,
    currency,
    truncated: rows.length >= MAX_TRADES,
    postingsUnknown,
  };
}

function toAnalyticsTrade(row: TradeRow): AnalyticsTrade {
  return {
    id: row.id,
    instrumentCode: row.instrument_code,
    marketCode: row.market_code,
    direction: row.direction,
    openedAt: new Date(row.opened_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    localDate: row.local_date,
    status: row.status,
    netAccount: toDec(row.net_realized_account),
    finalR: toDec(row.final_r),
    setupId: row.setup_id,
    emotionBefore: row.emotion_before,
  };
}

/** Границы периода по числу дней назад; null — вся история. */
export function periodRange(days: number | null): { from: Date; to: Date } {
  const to = new Date();
  const from = days === null ? new Date(0) : new Date(to.getTime() - days * 86_400_000);
  return { from, to };
}

/** Предыдущий период такой же длительности — для сравнения. */
export function previousRange(days: number): { from: Date; to: Date } {
  const to = new Date(Date.now() - days * 86_400_000);
  return { from: new Date(to.getTime() - days * 86_400_000), to };
}

export const ZERO_MONEY = dec("0");
