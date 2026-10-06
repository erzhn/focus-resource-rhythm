import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "./client";

/**
 * Очередь исходящих сообщений.
 *
 * Зачем она нужна: отправка может не состояться (сеть, 429), и без очереди
 * сообщение просто пропало бы. А главное — event_key делает повтор
 * безвредным: напоминание с ключом «user:счёт:дата:вечерний_итог» не уйдёт
 * дважды, сколько бы раз ни запустился планировщик. Это важно, потому что
 * частота cron в проекте может меняться.
 */

export interface OutgoingMessage {
  userId?: string | null;
  chatId: number;
  /** Уникальный ключ события: повтор с тем же ключом ничего не добавляет. */
  eventKey: string;
  kind: string;
  body: string;
  sendAfter?: Date;
}

/** Ставит сообщение в очередь. Повтор с тем же ключом — не ошибка, а защита. */
export async function enqueue(sb: SupabaseClient, message: OutgoingMessage): Promise<boolean> {
  const { error } = await sb.from("notification_outbox").insert({
    user_id: message.userId ?? null,
    chat_id: message.chatId,
    event_key: message.eventKey,
    kind: message.kind,
    body: message.body,
    send_after: (message.sendAfter ?? new Date()).toISOString(),
  });

  if (error) {
    // 23505 — такое событие уже в очереди или отправлено.
    if (error.code === "23505") return false;
    console.error("outbox: не удалось поставить сообщение в очередь", error);
    return false;
  }
  return true;
}

export interface FlushResult {
  sent: number;
  failed: number;
  cancelled: number;
}

/**
 * Отправляет готовые сообщения.
 *
 * Пачка берётся функцией claim_outbox_messages с арендой: несколько
 * обработчиков не мешают друг другу, а зависшая попытка через минуту снова
 * становится доступной — сообщение не теряется.
 */
export async function flush(
  sb: SupabaseClient,
  token: string,
  limit = 20,
): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, cancelled: 0 };
  if (!token) return result;

  const { data, error } = await sb.rpc("claim_outbox_messages", {
    p_limit: limit,
    p_lease_seconds: 60,
  });
  if (error) {
    console.error("outbox: не удалось забрать пачку", error);
    return result;
  }

  const rows = (data ?? []) as {
    id: string;
    chat_id: number;
    body: string;
    attempts: number;
  }[];

  for (const row of rows) {
    const send = await sendMessage(token, row.chat_id, row.body);

    if (send.ok) {
      await sb
        .from("notification_outbox")
        .update({ state: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      result.sent += 1;
      continue;
    }

    if (send.gone) {
      // Бот заблокирован — повторять некуда. Отменяем, а не копим ошибки.
      await sb
        .from("notification_outbox")
        .update({ state: "cancelled", last_error: send.error ?? "чат недоступен" })
        .eq("id", row.id);
      result.cancelled += 1;
      continue;
    }

    // Пять попыток — и останавливаемся: дальше это уже не сбой связи.
    const exhausted = row.attempts >= 5;
    await sb
      .from("notification_outbox")
      .update({
        state: exhausted ? "failed" : "pending",
        last_error: send.error ?? "отправка не удалась",
        send_after: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq("id", row.id);
    result.failed += 1;
  }

  return result;
}
