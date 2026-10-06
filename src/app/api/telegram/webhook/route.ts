import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/env";
import { acceptUpdate, processPending } from "@/lib/telegram/inbox";
import { botToken } from "@/lib/telegram/client";
import type { TelegramUpdate } from "@/lib/telegram/handler";

/**
 * Вебхук Telegram.
 *
 * Обработчик намеренно тонкий: принять, положить в очередь, разобрать и
 * ответить 200. Вся логика — в src/lib/telegram.
 *
 * Подлинность проверяется секретным заголовком, который задаётся при
 * регистрации вебхука: иначе кто угодно смог бы слать сюда поддельные
 * обновления.
 *
 * Отвечаем 200 всегда, когда обновление надёжно принято. На ошибку Telegram
 * начнёт повторять доставку, а дубликаты пользователю не нужны — и теперь
 * повтор действительно безвреден: update_id уникален в очереди.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Телеграм не присылает больших тел; всё сверх этого — не его запрос. */
const MAX_BODY_BYTES = 1_000_000;

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  const token = botToken();
  if (!token || !isSupabaseConfigured) {
    // Бот не настроен — молча подтверждаем, чтобы Telegram не копил повторы.
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const sb = admin();

  try {
    const { duplicate } = await acceptUpdate(sb, update);
    // Повторная доставка: обновление уже в очереди и будет (или уже было)
    // обработано ровно один раз.
    if (!duplicate) await processPending(sb, token, 3);
  } catch (e) {
    console.error("telegram: приём обновления не удался", e);
    // 500 заставил бы Telegram повторять доставку; обновление уже в очереди,
    // и его подберёт обработчик очереди.
  }

  return NextResponse.json({ ok: true });
}

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  return createClient(supabaseUrl, key, { auth: { persistSession: false } });
}
