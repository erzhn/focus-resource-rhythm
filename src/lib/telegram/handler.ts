import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HELP_TEXT, parseBotMessage } from "@/domain/finance/telegram";
import { parseTradingCommand, TRADING_HELP } from "@/domain/trading/telegram";
import { redeemLinkToken, userIdByChat } from "./link";
import { record, report, undoLast } from "./expenses";
import { handleTradingCommand } from "./trading";

/**
 * Маршрутизация сообщения бота.
 *
 * Порядок разбора важен и выбран так, чтобы не сломать то, что работало:
 *
 *   1. /start — привязка чата.
 *   2. Явная ТОРГОВАЯ команда.
 *   3. Всё остальное — прежний разбор расходов, включая свободный текст.
 *
 * Свободный текст никогда не становится сделкой. «Такси 250» — это трата, и
 * любое другое поведение было бы для владельца неожиданностью.
 */

export interface TelegramUpdate {
  update_id?: number;
  message?: { chat?: { id: number }; text?: string };
  edited_message?: { chat?: { id: number }; text?: string };
}

export interface HandledUpdate {
  chatId: number;
  reply: string;
}

export async function handleUpdate(
  sb: SupabaseClient,
  update: TelegramUpdate,
): Promise<HandledUpdate | null> {
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  if (!chatId) return null;

  const text = message?.text ?? "";
  const reply = await route(sb, chatId, text);
  return reply === null ? null : { chatId, reply };
}

async function route(sb: SupabaseClient, chatId: number, text: string): Promise<string | null> {
  const trimmed = text.trim();

  if (/^\/start\b/i.test(trimmed)) {
    const code = trimmed.split(/\s+/)[1];
    if (!code) {
      return "Чтобы связать чат с аккаунтом, откройте Настройки в приложении, получите код и пришлите его так:\n/start ВАШ_КОД";
    }
    const result = await redeemLinkToken(sb, chatId, code);
    return result.ok ? `${result.message}\n\n${helpText()}` : result.message;
  }

  const userId = await userIdByChat(sb, chatId);
  if (!userId) {
    return "Чат не связан с аккаунтом. Возьмите код в Настройках приложения и пришлите: /start ВАШ_КОД";
  }

  const trading = parseTradingCommand(trimmed);
  if (trading) {
    return await handleTradingCommand(sb, userId, chatId, trading);
  }

  const cmd = parseBotMessage(trimmed);
  if (cmd.type === "help" || cmd.type === "empty") return helpText();
  if (cmd.type === "today") return await report(sb, userId, "day");
  if (cmd.type === "month") return await report(sb, userId, "month");
  if (cmd.type === "undo") return await undoLast(sb, userId);
  if (cmd.type === "start") return "Чат уже связан с аккаунтом.";

  const { entries, unparsed } = cmd.parsed;
  if (entries.length === 0) {
    return `Не нашёл сумму${unparsed.length ? ` в «${unparsed[0]}»` : ""}. Напишите, например: Такси 250`;
  }
  return await record(sb, userId, entries);
}

const helpText = () => `${HELP_TEXT}\n\n${TRADING_HELP}`;
