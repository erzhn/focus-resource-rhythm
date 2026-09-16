import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/env";

/**
 * Пинг базы, чтобы проект Supabase не уснул.
 *
 * На бесплатном тарифе Supabase ставит проект на паузу после недели без
 * обращений: DNS снимается, приложение перестаёт авторизовывать. Запускается
 * по расписанию из vercel.json раз в сутки — этого достаточно с большим запасом.
 *
 * Запрос обязан дойти до БАЗЫ: одного HTTP-ответа приложения недостаточно,
 * активность считается по обращениям к проекту Supabase.
 */

export const runtime = "nodejs";
// Ответ не кэшируем — иначе cron будет получать сохранённый результат,
// запрос до базы не дойдёт, и проект всё равно уснёт.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: true, skipped: "демо-режим: база не настроена" });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "Нет SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    // Лёгкое чтение служебной таблицы: строки не возвращаем, только считаем запрос.
    const { error } = await supabase.from("rate_limits").select("key", { count: "exact", head: true });
    if (error) throw error;

    return NextResponse.json({ ok: true, tookMs: Date.now() - startedAt });
  } catch (e) {
    // Текст ошибки может содержать служебные детали — наружу отдаём общий статус.
    console.error("keep-alive: обращение к базе не удалось", e);
    return NextResponse.json({ ok: false, error: "База недоступна" }, { status: 503 });
  }
}

/**
 * Доступ к эндпоинту.
 *
 * Vercel подставляет заголовок Authorization с CRON_SECRET, если переменная задана,
 * и всегда помечает вызовы планировщика заголовком x-vercel-cron. Секрет задать
 * стоит: иначе адрес может дёргать кто угодно.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return req.headers.get("x-vercel-cron") !== null;
}
