import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/env";
import { financialDayOf } from "@/domain/finance/day";
import {
  budgetStatus, computeBalance, effectiveDailyBudgetMinor,
  summarizeDay, summarizeMonth, type Transaction,
} from "@/domain/finance/stats";
import { dailyReport } from "@/domain/finance/report";
import type { CategoryId } from "@/domain/finance/categories";
import { enqueue, flush } from "@/lib/telegram/outbox";

/**
 * Ежедневный отчёт в Telegram по расписанию.
 *
 * Запускается планировщиком Vercel в 16:00 UTC — это 22:00 по Бишкеку, когда
 * день практически закончился, но до смены финансовых суток (01:00) ещё далеко.
 *
 * Отчёт уходит только тем, кто связал чат и у кого за день были операции:
 * пустое «расходов не было» каждый вечер быстро превращается в спам.
 *
 * Отправка идёт через очередь исходящих с ключом «user:день:тип». Благодаря
 * ему повторный запуск планировщика не пришлёт отчёт второй раз — а частота
 * запуска в проекте может измениться.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!token || !serviceKey || !isSupabaseConfigured) {
    return NextResponse.json({ ok: true, skipped: "бот или база не настроены" });
  }

  const sb = adminClient(serviceKey);
  const day = financialDayOf(new Date());

  const { data: links, error } = await sb
    .from("telegram_links")
    .select("user_id, chat_id")
    .not("chat_id", "is", null);

  if (error) {
    console.error("daily-report: не удалось получить привязки", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let queued = 0;
  for (const link of links ?? []) {
    try {
      const text = await buildReport(sb, link.user_id as string, day);
      if (!text) continue; // за день ничего не было — не беспокоим

      const added = await enqueue(sb, {
        userId: link.user_id as string,
        chatId: link.chat_id as number,
        // Ключ одноразовости: пользователь, финансовый день, тип события.
        eventKey: `daily-report:${link.user_id}:${day}`,
        kind: "daily_report",
        body: text,
      });
      if (added) queued += 1;
    } catch (e) {
      // Один сбойный получатель не должен останавливать рассылку остальным.
      console.error("daily-report: подготовка отчёта не удалась", e);
    }
  }

  const outbox = await flush(sb, token, 100);
  return NextResponse.json({ ok: true, queued, outbox, total: links?.length ?? 0 });
}

type Admin = ReturnType<typeof adminClient>;

function adminClient(serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

/** Текст отчёта или null, если за день не было ни одной операции. */
async function buildReport(sb: Admin, userId: string, day: string): Promise<string | null> {
  const [{ data: rows }, { data: settings }] = await Promise.all([
    sb.from("transactions").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(1000),
    sb
      .from("user_settings")
      .select("opening_balance_minor, daily_budget_minor, daily_money_limit, main_currency")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const all: Transaction[] = ((rows ?? []) as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    kind: t.kind as Transaction["kind"],
    amountMinor: Number(t.amount_minor),
    currency: (t.currency as string) ?? "KGS",
    category: (t.category as CategoryId | null) ?? null,
    description: (t.description as string) ?? "",
    occurredAt: new Date(t.occurred_at as string),
    day: String(t.financial_day),
  }));

  if (!all.some((t) => t.day === day)) return null;

  const num = (v: unknown) => (v == null ? null : Number(v));
  const cfg = (settings ?? {}) as Record<string, unknown>;
  const currency = (cfg.main_currency as string) ?? "KGS";
  const today = summarizeDay(all, day, currency);

  return dailyReport({
    day,
    today,
    month: summarizeMonth(all, day, currency),
    currency,
    dayBudget: budgetStatus(
      today.expensesMinor,
      effectiveDailyBudgetMinor(num(cfg.daily_budget_minor), num(cfg.daily_money_limit)),
    ),
    balanceMinor: computeBalance(all, num(cfg.opening_balance_minor), currency),
  });
}

/** Тот же механизм доступа, что у keep-alive: секрет планировщика или его заголовок. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return req.headers.get("x-vercel-cron") !== null;
}
