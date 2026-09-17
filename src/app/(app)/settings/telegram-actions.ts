"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Код привязки Telegram-чата.
 *
 * Бот видит только chat_id и не знает, чей это чат. Пользователь берёт здесь
 * одноразовый код и отправляет боту «/start КОД» — так чат связывается с
 * аккаунтом. Код живёт 15 минут: просроченным воспользоваться нельзя.
 */

export interface LinkCodeState {
  code?: string;
  error?: string;
}

const TTL_MINUTES = 15;

export async function createLinkCode(): Promise<LinkCodeState> {
  if (!isSupabaseConfigured) return { error: "Недоступно в демо-режиме." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нужно войти в аккаунт." };

  // Короткий, но не угадываемый: 8 символов из 32^8 вариантов, живёт 15 минут.
  const code = randomBytes(5).toString("base64url").replace(/[-_]/g, "").slice(0, 8).toUpperCase();
  const expires = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabase.from("telegram_links").upsert(
    { user_id: user.id, link_code: code, code_expires_at: expires },
    { onConflict: "user_id" },
  );
  if (error) return { error: "Не получилось создать код. Попробуйте ещё раз." };

  return { code };
}
