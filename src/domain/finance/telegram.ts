import { parseEntries, type ParseResult } from "./parse";

/**
 * Разбор сообщений Telegram-бота.
 *
 * Бот намеренно почти не имеет команд: основной сценарий — прислать «Такси 250»
 * и получить подтверждение. Команды нужны только там, где текст двусмыслен.
 */

export type BotCommand =
  | { type: "start"; code: string | null }
  | { type: "today" }
  | { type: "month" }
  | { type: "undo" }
  | { type: "help" }
  | { type: "entries"; parsed: ParseResult }
  | { type: "empty" };

/** Команда или список операций из текста сообщения. */
export function parseBotMessage(text: string): BotCommand {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { type: "empty" };

  if (trimmed.startsWith("/")) {
    // В группах Telegram дописывает имя бота: «/today@my_bot».
    const [rawCmd, ...rest] = trimmed.split(/\s+/);
    const cmd = rawCmd.slice(1).split("@")[0].toLowerCase();

    switch (cmd) {
      case "start":
        return { type: "start", code: rest[0]?.trim() || null };
      case "today":
      case "день":
        return { type: "today" };
      case "month":
      case "месяц":
        return { type: "month" };
      case "undo":
      case "отмена":
        return { type: "undo" };
      case "help":
      case "помощь":
        return { type: "help" };
      default:
        return { type: "help" };
    }
  }

  return { type: "entries", parsed: parseEntries(trimmed) };
}

export const HELP_TEXT = [
  "Я записываю расходы и доходы.",
  "",
  "Просто напишите операцию:",
  "• Такси 250",
  "• Кофе 180",
  "• Зарплата 20000",
  "",
  "Можно несколько строк сразу — каждая станет отдельной записью.",
  "",
  "Команды:",
  "/today — итог за сегодня",
  "/month — итог за месяц",
  "/undo — удалить последнюю запись",
].join("\n");

/** Экранирование для parse_mode=HTML: иначе описание с «<» сломает сообщение. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
