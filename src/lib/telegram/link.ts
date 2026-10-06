import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Привязка чата к аккаунту одноразовым кодом.
 *
 * В базе лежит ТОЛЬКО хеш кода. Раньше код хранился открытым текстом, и
 * доступ к таблице давал возможность привязать чужой чат к своему. Хеш эту
 * возможность убирает: по нему код не восстановить.
 *
 * Погашение атомарное: один UPDATE и проверяет срок, и помечает код
 * использованным, поэтому два одновременных «/start КОД» не привяжут два чата.
 */

const TTL_MINUTES = 15;

/** Хеш кода. Код короткий, но живёт 15 минут — перебор за это время нереален. */
export const hashCode = (code: string) =>
  createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

/** Код из 8 символов без похожих друг на друга знаков. */
export function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export interface IssuedToken {
  code: string;
  expiresAt: Date;
}

/**
 * Выпускает новый код и гасит предыдущие непогашенные: если человек попросил
 * новый код, старый ему больше не нужен и висеть не должен.
 */
export async function issueLinkToken(
  sb: SupabaseClient,
  userId: string,
): Promise<IssuedToken | { error: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

  await sb.from("telegram_link_tokens").delete().eq("user_id", userId).is("used_at", null);

  const { error } = await sb.from("telegram_link_tokens").insert({
    user_id: userId,
    token_hash: hashCode(code),
    expires_at: expiresAt.toISOString(),
  });

  if (error) return { error: "Не получилось создать код. Попробуйте ещё раз." };
  return { code, expiresAt };
}

export interface RedeemResult {
  ok: boolean;
  userId?: string;
  message: string;
}

/**
 * Гасит код и связывает чат с аккаунтом.
 *
 * Вызывается вебхуком под service-role, поэтому RLS здесь не защищает —
 * владельца определяет сам код, и больше ничто.
 */
export async function redeemLinkToken(
  sb: SupabaseClient,
  chatId: number,
  code: string,
): Promise<RedeemResult> {
  const hash = hashCode(code);

  // Условия в самом UPDATE: строка достанется только если код ещё не
  // использован и не истёк. Проверять отдельным SELECT нельзя — между
  // проверкой и записью код мог бы погасить кто-то другой.
  const { data, error } = await sb
    .from("telegram_link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("telegram: погашение кода не удалось", error);
    return { ok: false, message: "Не получилось связать чат. Попробуйте ещё раз." };
  }
  if (!data) {
    return {
      ok: false,
      message: "Код не найден, истёк или уже использован. Получите новый в Настройках приложения.",
    };
  }

  const userId = data.user_id as string;
  const { error: linkError } = await sb.from("telegram_links").upsert(
    {
      user_id: userId,
      chat_id: chatId,
      linked_at: new Date().toISOString(),
      revoked_at: null,
      // Открытый код больше не используется: поле осталось от прежней схемы.
      link_code: null,
      code_expires_at: null,
    },
    { onConflict: "user_id" },
  );

  if (linkError) {
    console.error("telegram: привязка чата не удалась", linkError);
    return { ok: false, message: "Не получилось связать чат. Попробуйте ещё раз." };
  }

  return { ok: true, userId, message: "Готово, чат связан." };
}

/** Кому принадлежит чат. Отозванные привязки не считаются. */
export async function userIdByChat(sb: SupabaseClient, chatId: number): Promise<string | null> {
  const { data } = await sb
    .from("telegram_links")
    .select("user_id, revoked_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  return (data.user_id as string) ?? null;
}
