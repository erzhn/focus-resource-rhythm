import "server-only";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/env";
import { consume, limitKey, type WindowState } from "./window";

/**
 * Ограничение частоты запросов.
 *
 * Хранилище — Postgres (Supabase), который в проекте уже есть: отдельный Redis
 * не заводим. Serverless-функции не делят память между вызовами, поэтому счётчик
 * обязан быть общим, а инкремент — атомарным (см. функцию consume_rate_limit).
 *
 * Если Supabase не настроен (демо-режим, локальная разработка), используется
 * запасной счётчик в памяти процесса. Он НЕ надёжен на serverless — это
 * осознанный компромисс, чтобы разработка не требовала БД.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Через сколько секунд можно повторить (для заголовка Retry-After). */
  retryAfterSeconds: number;
}

const memory = new Map<string, WindowState>();

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!isSupabaseConfigured || !key) return null;
  return createClient(supabaseUrl, key, { auth: { persistSession: false } });
}

/**
 * Потребляет одну единицу лимита.
 *
 * При сбое хранилища запрос ПРОПУСКАЕТСЯ (fail-open): недоступность служебной
 * таблицы не должна превращаться в отказ в обслуживании для настоящего пользователя.
 */
export async function rateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = limitKey(scope, subject);
  const supabase = adminClient();

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("consume_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        const resetAt = new Date(row.reset_at).getTime();
        return {
          allowed: Boolean(row.allowed),
          remaining: Number(row.remaining ?? 0),
          retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
        };
      }
    } catch {
      // Хранилище недоступно — не блокируем пользователя, см. комментарий выше.
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
  }

  const d = consume(memory.get(key) ?? null, Date.now(), limit, windowSeconds * 1000);
  memory.set(key, d.next);
  return {
    allowed: d.allowed,
    remaining: d.remaining,
    retryAfterSeconds: Math.max(1, Math.ceil(d.resetInMs / 1000)),
  };
}

/** IP клиента из заголовков прокси. Для ключа лимита, не для хранения. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}
