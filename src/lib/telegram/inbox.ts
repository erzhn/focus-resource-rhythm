import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleUpdate, type TelegramUpdate } from "./handler";
import { enqueue, flush } from "./outbox";

/**
 * Очередь входящих обновлений.
 *
 * Простого «записали update_id и больше не обрабатываем» недостаточно:
 * обработка могла оборваться сразу после записи идентификатора, и событие
 * потерялось бы навсегда. Поэтому у каждого обновления есть состояние, число
 * попыток и аренда: если обработчик не довёл дело до конца, через минуту
 * обновление снова станет доступным.
 *
 * Повтор доставки от Telegram безвреден дважды: сам update_id уникален, а
 * ответ уходит через очередь исходящих с ключом, привязанным к обновлению.
 */

export interface AcceptResult {
  /** Обновление новое и принято в работу. */
  accepted: boolean;
  /** Такое обновление уже приходило — повторная доставка. */
  duplicate: boolean;
}

export async function acceptUpdate(
  sb: SupabaseClient,
  update: TelegramUpdate,
): Promise<AcceptResult> {
  const updateId = update.update_id;
  if (typeof updateId !== "number") return { accepted: false, duplicate: false };

  const chatId = update.message?.chat?.id ?? update.edited_message?.chat?.id ?? null;

  const { error } = await sb.from("telegram_updates").insert({
    update_id: updateId,
    chat_id: chatId,
    payload: update as unknown as Record<string, unknown>,
  });

  if (error) {
    // 23505 — уже принимали: Telegram повторил доставку.
    if (error.code === "23505") return { accepted: false, duplicate: true };
    console.error("telegram: не удалось принять обновление", error);
    return { accepted: false, duplicate: false };
  }
  return { accepted: true, duplicate: false };
}

export interface ProcessResult {
  processed: number;
  failed: number;
}

/**
 * Разбирает пачку необработанных обновлений.
 *
 * Берёт их функцией claim_telegram_updates: она ставит состояние processing и
 * аренду под skip locked, поэтому параллельные обработчики не берутся за одно
 * и то же, а зависшая попытка возвращается в работу.
 */
export async function processPending(
  sb: SupabaseClient,
  token: string,
  limit = 5,
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, failed: 0 };

  const { data, error } = await sb.rpc("claim_telegram_updates", {
    p_limit: limit,
    p_lease_seconds: 60,
  });
  if (error) {
    console.error("telegram: не удалось забрать обновления", error);
    return result;
  }

  const rows = (data ?? []) as {
    update_id: number;
    payload: TelegramUpdate;
    attempts: number;
  }[];

  for (const row of rows) {
    try {
      const handled = await handleUpdate(sb, row.payload);

      if (handled) {
        // Ключ привязан к обновлению: повторная обработка не пошлёт ответ дважды.
        await enqueue(sb, {
          chatId: handled.chatId,
          eventKey: `reply:${row.update_id}`,
          kind: "reply",
          body: handled.reply,
        });
      }

      await sb
        .from("telegram_updates")
        .update({ state: "processed", processed_at: new Date().toISOString(), last_error: null })
        .eq("update_id", row.update_id);
      result.processed += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "неизвестная ошибка";
      console.error(`telegram: обработка ${row.update_id} не удалась`, e);

      // Пять попыток — и останавливаемся, иначе очередь будет вечно крутить
      // заведомо нерабочее обновление.
      const exhausted = row.attempts >= 5;
      await sb
        .from("telegram_updates")
        .update({
          state: exhausted ? "failed" : "received",
          lease_until: null,
          last_error: message,
        })
        .eq("update_id", row.update_id);

      if (exhausted && row.payload.message?.chat?.id) {
        await enqueue(sb, {
          chatId: row.payload.message.chat.id,
          eventKey: `failed:${row.update_id}`,
          kind: "error",
          body: "Не получилось обработать сообщение. Попробуйте ещё раз или откройте приложение.",
        });
      }
      result.failed += 1;
    }
  }

  // Ответы отправляем сразу: очередь нужна ради надёжности, а не ради задержки.
  if (result.processed > 0 || result.failed > 0) {
    await flush(sb, token, limit * 2);
  }

  return result;
}
