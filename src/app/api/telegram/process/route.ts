import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/env";
import { processPending } from "@/lib/telegram/inbox";
import { flush } from "@/lib/telegram/outbox";
import { botToken } from "@/lib/telegram/client";

/**
 * Дообработка очередей.
 *
 * Нужна ровно для того случая, ради которого очередь и заводилась: обработка
 * оборвалась после приёма обновления. Вебхук уже ответил 200, Telegram больше
 * не повторит, и без этого обработчика событие осталось бы лежать навсегда.
 *
 * Запускается планировщиком. Безопасен при любой частоте: аренда не даёт
 * двум запускам взяться за одно обновление, а ключи событий не дают отправить
 * одно и то же сообщение дважды.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  // Без секрета принимаем только вызов планировщика Vercel.
  return req.headers.get("x-vercel-cron") !== null;
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Не авторизовано" }, { status: 401 });
  }
  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: true, skipped: "База не настроена" });
  }

  const token = botToken();
  if (!token) return NextResponse.json({ ok: true, skipped: "Бот не настроен" });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  const inbox = await processPending(sb, token, 25);
  const outbox = await flush(sb, token, 50);

  return NextResponse.json({ ok: true, inbox, outbox });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
