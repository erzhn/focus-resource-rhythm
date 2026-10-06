import "server-only";

/**
 * Обращения к Telegram Bot API.
 *
 * Отдельный модуль нужен ради одного различия: отказ отказу рознь. Сетевая
 * ошибка и 429 — повод повторить позже, а «бот заблокирован пользователем» —
 * повод перестать слать вовсе. Если не различать, очередь исходящих будет
 * вечно колотиться в заблокированный чат.
 */

const API = "https://api.telegram.org";

export interface SendResult {
  ok: boolean;
  /** Имеет смысл повторить позже. */
  retryable: boolean;
  /** Чат недоступен навсегда: бот заблокирован или удалён. */
  gone: boolean;
  error?: string;
}

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<SendResult> {
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (res.ok) return { ok: true, retryable: false, gone: false };

    const data = (await res.json().catch(() => ({}))) as { description?: string };
    const description = data.description ?? `HTTP ${res.status}`;

    // 403 — бот заблокирован или выкинут из чата; повторять бессмысленно.
    const gone = res.status === 403 || /blocked|kicked|chat not found/i.test(description);
    // 429 и 5xx — временные.
    const retryable = !gone && (res.status === 429 || res.status >= 500);

    return { ok: false, retryable, gone, error: description };
  } catch (e) {
    // Сеть не ответила — состояние неизвестно, повторить стоит.
    return {
      ok: false,
      retryable: true,
      gone: false,
      error: e instanceof Error ? e.message : "сеть недоступна",
    };
  }
}

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
