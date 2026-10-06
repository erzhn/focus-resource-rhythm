"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { issueLinkToken } from "@/lib/telegram/link";

/**
 * Код привязки Telegram-чата.
 *
 * Бот видит только chat_id и не знает, чей это чат. Пользователь берёт здесь
 * одноразовый код и отправляет боту «/start КОД».
 *
 * В базу попадает только ХЕШ кода: раньше он хранился открытым текстом, и
 * доступ к таблице давал возможность привязать чужой чат к своему аккаунту.
 */

export interface LinkCodeState {
  code?: string;
  error?: string;
}

export async function createLinkCode(): Promise<LinkCodeState> {
  if (!isSupabaseConfigured) return { error: "Недоступно в демо-режиме." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нужно войти в аккаунт." };

  const issued = await issueLinkToken(supabase, user.id);
  if ("error" in issued) return { error: issued.error };
  return { code: issued.code };
}
