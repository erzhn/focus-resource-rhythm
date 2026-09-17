import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/env";
import { financialDayOf } from "@/domain/finance/day";
import { detectCategory, CATEGORY_BY_ID, type CategoryId } from "@/domain/finance/categories";
import { budgetStatus, summarizeDay, summarizeMonth, type Transaction } from "@/domain/finance/stats";
import { computeBalance } from "@/domain/finance/stats";
import { confirmation, dailyReport } from "@/domain/finance/report";
import { HELP_TEXT, parseBotMessage } from "@/domain/finance/telegram";
import { learnCategories, suggestCategory } from "@/domain/finance/learn";

/**
 * Вебхук Telegram-бота: запись расходов прямо из чата.
 *
 * Telegram дёргает этот адрес при каждом сообщении. Подлинность проверяем по
 * секретному заголовку, который задаётся при регистрации вебхука, — иначе
 * кто угодно смог бы слать сюда поддельные обновления.
 *
 * Отвечаем всегда 200: на ошибку Telegram начнёт повторять доставку, а
 * пользователю дублирующиеся записи не нужны. Проблемы сообщаем текстом в чат.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = "https://api.telegram.org";

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !isSupabaseConfigured) {
    // Бот не настроен — молча подтверждаем, чтобы Telegram не повторял доставку.
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true });

  try {
    const reply = await handle(chatId, msg?.text ?? "");
    if (reply) await send(token, chatId, reply);
  } catch (e) {
    console.error("telegram: обработка сообщения не удалась", e);
    await send(token, chatId, "Не получилось обработать сообщение. Попробуйте ещё раз.").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  return createClient(supabaseUrl, key, { auth: { persistSession: false } });
}

/** Обрабатывает сообщение и возвращает текст ответа. */
async function handle(chatId: number, text: string): Promise<string> {
  const sb = admin();
  const cmd = parseBotMessage(text);

  if (cmd.type === "start") {
    if (!cmd.code) {
      return "Чтобы связать чат с аккаунтом, откройте Настройки в приложении, скопируйте код и пришлите его так:\n/start ВАШ_КОД";
    }
    return linkChat(sb, chatId, cmd.code);
  }

  // Все остальные действия требуют привязанного аккаунта.
  const userId = await userIdByChat(sb, chatId);
  if (!userId) {
    return "Чат не связан с аккаунтом. Возьмите код в Настройках приложения и пришлите: /start ВАШ_КОД";
  }

  if (cmd.type === "help" || cmd.type === "empty") return HELP_TEXT;
  if (cmd.type === "today") return await report(sb, userId, "day");
  if (cmd.type === "month") return await report(sb, userId, "month");
  if (cmd.type === "undo") return await undoLast(sb, userId);

  // Запись операций.
  const { entries, unparsed } = cmd.parsed;
  if (entries.length === 0) {
    return `Не нашёл сумму${unparsed.length ? ` в «${unparsed[0]}»` : ""}. Напишите, например: Такси 250`;
  }

  return await record(sb, userId, entries);
}

async function linkChat(sb: ReturnType<typeof admin>, chatId: number, code: string): Promise<string> {
  const { data } = await sb
    .from("telegram_links")
    .select("user_id, code_expires_at")
    .eq("link_code", code.trim())
    .maybeSingle();

  if (!data) return "Код не найден. Откройте Настройки в приложении и получите новый.";
  if (data.code_expires_at && new Date(data.code_expires_at) < new Date()) {
    return "Код истёк. Получите новый в Настройках приложения.";
  }

  // Код одноразовый: после привязки стираем, чтобы им нельзя было воспользоваться дважды.
  const { error } = await sb
    .from("telegram_links")
    .update({ chat_id: chatId, link_code: null, code_expires_at: null, linked_at: new Date().toISOString() })
    .eq("user_id", data.user_id);

  if (error) {
    console.error("telegram: привязка чата не удалась", error);
    return "Не получилось связать чат. Попробуйте получить код заново.";
  }
  return `Готово, чат связан.\n\n${HELP_TEXT}`;
}

async function userIdByChat(sb: ReturnType<typeof admin>, chatId: number): Promise<string | null> {
  const { data } = await sb.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
  return (data?.user_id as string) ?? null;
}

/** Операции пользователя за нужный период. */
async function loadTransactions(
  sb: ReturnType<typeof admin>,
  userId: string,
  limit = 1000,
): Promise<Transaction[]> {
  const { data } = await sb
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    kind: t.kind as Transaction["kind"],
    amountMinor: Number(t.amount_minor),
    currency: (t.currency as string) ?? "KGS",
    category: (t.category as CategoryId | null) ?? null,
    description: (t.description as string) ?? "",
    occurredAt: new Date(t.occurred_at as string),
    day: String(t.financial_day),
  }));
}

async function loadSettings(sb: ReturnType<typeof admin>, userId: string) {
  const { data } = await sb
    .from("user_settings")
    .select("opening_balance_minor, daily_budget_minor, monthly_budget_minor, main_currency")
    .eq("user_id", userId)
    .maybeSingle();
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    currency: (data?.main_currency as string) ?? "KGS",
    openingBalanceMinor: num(data?.opening_balance_minor),
    dailyBudgetMinor: num(data?.daily_budget_minor),
    monthlyBudgetMinor: num(data?.monthly_budget_minor),
  };
}

async function record(
  sb: ReturnType<typeof admin>,
  userId: string,
  entries: { amountMinor: number; currency: string; description: string; kind: Transaction["kind"]; category: CategoryId | null }[],
): Promise<string> {
  const history = await loadTransactions(sb, userId);
  const settings = await loadSettings(sb, userId);

  // Подсказка по истории: встроенный словарь не знает про местные магазины.
  const learned = learnCategories(
    history
      .filter((t) => t.kind === "expense" && t.category)
      .map((t) => ({ description: t.description, category: t.category as CategoryId, occurredAt: t.occurredAt })),
  );

  const now = new Date();
  const day = financialDayOf(now);

  const rows = entries.map((e) => {
    const category =
      e.kind !== "expense"
        ? null
        : e.category ?? suggestCategory(e.description, learned) ?? detectCategory(e.description) ?? "other";
    return {
      user_id: userId,
      kind: e.kind,
      amount_minor: e.amountMinor,
      currency: e.currency,
      category,
      description: e.description,
      occurred_at: now.toISOString(),
      financial_day: day,
    };
  });

  const { error } = await sb.from("transactions").insert(rows);
  if (error) {
    console.error("telegram: запись операций не удалась", error);
    return "Не получилось сохранить. Попробуйте ещё раз.";
  }

  // Пересобираем сводку с учётом новых записей, не перезапрашивая базу.
  const added: Transaction[] = rows.map((r, i) => ({
    id: `new-${i}`,
    kind: r.kind,
    amountMinor: r.amount_minor,
    currency: r.currency,
    category: r.category as CategoryId | null,
    description: r.description,
    occurredAt: now,
    day,
  }));

  const all = [...history, ...added];
  const today = summarizeDay(all, day, settings.currency);

  return confirmation(
    added.map((a) => {
      const meta = a.category ? CATEGORY_BY_ID.get(a.category) : null;
      return {
        amountMinor: a.amountMinor,
        currency: a.currency,
        categoryLabel: meta?.label ?? null,
        emoji: meta?.emoji ?? null,
        kind: a.kind,
      };
    }),
    today.expensesMinor,
    settings.currency,
    budgetStatus(today.expensesMinor, settings.dailyBudgetMinor),
  );
}

async function report(sb: ReturnType<typeof admin>, userId: string, scope: "day" | "month"): Promise<string> {
  const [all, settings] = await Promise.all([loadTransactions(sb, userId), loadSettings(sb, userId)]);
  const day = financialDayOf(new Date());
  const today = summarizeDay(all, day, settings.currency);
  const month = summarizeMonth(all, day, settings.currency);

  return dailyReport({
    day,
    today: scope === "day" ? today : month,
    month,
    currency: settings.currency,
    dayBudget: scope === "day" ? budgetStatus(today.expensesMinor, settings.dailyBudgetMinor) : null,
    balanceMinor: computeBalance(all, settings.openingBalanceMinor, settings.currency),
  });
}

async function undoLast(sb: ReturnType<typeof admin>, userId: string): Promise<string> {
  const { data } = await sb
    .from("transactions")
    .select("id, description, amount_minor, currency")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return "Удалять нечего — записей нет.";

  const { error } = await sb.from("transactions").delete().eq("id", data.id);
  if (error) return "Не получилось удалить запись.";

  return `Удалил: ${data.description} — ${Number(data.amount_minor) / 100} ${data.currency}`;
}

/** Отправка сообщения в чат. */
async function send(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

interface TelegramUpdate {
  message?: { chat?: { id: number }; text?: string };
  edited_message?: { chat?: { id: number }; text?: string };
}
