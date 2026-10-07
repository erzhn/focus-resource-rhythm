import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { ZERO, add, dec, type Decimal } from "@/domain/trading/decimal";
import { monthOf, shiftDate } from "@/domain/trading/day";
import { toDec, type TradeRow } from "./mappers";

/**
 * Данные дневника.
 *
 * День в календаре может быть в одном из нескольких состояний, и их нельзя
 * сваливать в одно:
 *
 *   • торговли не было и день отмечен выходным — это не пропуск;
 *   • торговли не было, день рабочий — тоже не обязательно пропуск;
 *   • сделки есть, вечерний итог не заполнен — вот это незавершённый разбор;
 *   • позиции ещё открыты — результат дня не определён.
 *
 * Поэтому у дня отдельно хранятся «есть утренняя запись» и «есть вечерний
 * итог»: наличие первой ничего не говорит о второй.
 */

export interface JournalDay {
  date: string;
  /** Сделок, открытых в этот локальный день. */
  trades: number;
  /** Результат закрытых в этот день сделок; null — закрытых не было. */
  net: Decimal | null;
  /** Остались открытые позиции — итог дня ещё не определён. */
  hasOpen: boolean;
  /** Сделки есть, но денежный итог хотя бы одной неизвестен. */
  unknownResult: boolean;
  plan: string | null;
  mood: string | null;
  outcome: string | null;
  lesson: string | null;
  isDayOff: boolean;
  morningDone: boolean;
  eveningDone: boolean;
  /** Разбор не завершён: сделки были, а итога дня нет. */
  reviewPending: boolean;
}

export interface JournalMonth {
  month: string;
  days: JournalDay[];
  currency: string;
}

export async function loadJournalMonth(
  accountId: string,
  currency: string,
  month: string,
): Promise<JournalMonth> {
  if (!isSupabaseConfigured) return { month, days: [], currency };

  const sb = await createClient();
  const first = `${month}-01`;
  const last = lastDayOf(month);

  const [tradesResult, daysResult] = await Promise.all([
    sb
      .from("trading_trades_v")
      .select("id, local_date, status, net_realized_account, closed_at")
      .eq("account_id", accountId)
      .neq("status", "voided")
      .gte("local_date", first)
      .lte("local_date", last),
    sb
      .from("trading_journal_days")
      .select("*")
      .eq("account_id", accountId)
      .gte("day_date", first)
      .lte("day_date", last),
  ]);

  const trades = (tradesResult.data ?? []) as Pick<
    TradeRow,
    "id" | "local_date" | "status" | "net_realized_account"
  >[];

  const entries = new Map<string, { trades: number; net: Decimal | null; open: boolean; unknown: boolean }>();
  for (const t of trades) {
    const bucket = entries.get(t.local_date) ?? { trades: 0, net: null, open: false, unknown: false };
    bucket.trades += 1;
    if (t.status === "open") bucket.open = true;
    if (t.status === "closed") {
      const value = toDec(t.net_realized_account);
      if (value === null) bucket.unknown = true;
      else bucket.net = add(bucket.net ?? ZERO, value);
    }
    entries.set(t.local_date, bucket);
  }

  const notes = new Map<string, Record<string, unknown>>();
  for (const d of daysResult.data ?? []) {
    notes.set(String(d.day_date), d as Record<string, unknown>);
  }

  const days: JournalDay[] = [];
  for (let date = first; date <= last; date = shiftDate(date, 1)) {
    const entry = entries.get(date);
    const note = notes.get(date);
    const eveningDone = Boolean(note?.evening_done_at);
    const hasTrades = (entry?.trades ?? 0) > 0;

    days.push({
      date,
      trades: entry?.trades ?? 0,
      net: entry?.net ?? null,
      hasOpen: entry?.open ?? false,
      unknownResult: entry?.unknown ?? false,
      plan: (note?.plan as string) ?? null,
      mood: (note?.mood as string) ?? null,
      outcome: (note?.outcome as string) ?? null,
      lesson: (note?.lesson as string) ?? null,
      isDayOff: Boolean(note?.is_day_off),
      morningDone: Boolean(note?.morning_done_at),
      eveningDone,
      // Разбор ждёт только там, где было что разбирать.
      reviewPending: hasTrades && !eveningDone,
    });
  }

  return { month, days, currency };
}

function lastDayOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}

export const currentMonth = () => monthOf(new Date().toISOString().slice(0, 10));
export const ZERO_NET = dec("0");
