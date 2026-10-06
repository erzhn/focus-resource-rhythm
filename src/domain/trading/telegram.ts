/**
 * Разбор торговых команд бота.
 *
 * Правило, от которого зависит целость журнала расходов: торговые действия
 * выполняются ТОЛЬКО по явной команде. Свободный текст «Такси 250» по-прежнему
 * означает расход — так было до появления этого модуля, и ломать это нельзя.
 *
 * Второе правило: неоднозначное не угадывается. Если в строке не хватает
 * инструмента или непонятно, где цена, а где объём, бот спрашивает. Подставить
 * золото молча — значит записать чужую сделку.
 */

/** Команды, относящиеся к торговле. Всё остальное обрабатывается как раньше. */
export const TRADING_COMMANDS = [
  "in",
  "log",
  "open",
  "out",
  "partial",
  "stop",
  "balance",
  "account",
  "market",
  "symbol",
  "trades",
] as const;

export type TradingCommandName = (typeof TRADING_COMMANDS)[number];

export interface TradeInput {
  symbol: string | null;
  direction: "long" | "short" | null;
  entry: string | null;
  stop: string | null;
  target: string | null;
  quantity: string | null;
}

export type TradingCommand =
  | { type: "in" | "log"; input: TradeInput; problems: string[] }
  | { type: "open" }
  | { type: "balance" }
  | { type: "account"; account?: string }
  | { type: "trades" }
  | { type: "out"; price: string | null; problems: string[] }
  | { type: "partial"; quantity: string | null; price: string | null; problems: string[] }
  | { type: "stop"; price: string | null; problems: string[] };

const LONG_WORDS = new Set(["long", "buy", "покупка", "купить", "лонг", "бай"]);
const SHORT_WORDS = new Set(["short", "sell", "продажа", "продать", "шорт", "селл"]);
const STOP_WORDS = new Set(["sl", "stop", "стоп"]);
const TARGET_WORDS = new Set(["tp", "target", "цель", "тейк"]);
const QTY_WORDS = new Set(["qty", "vol", "volume", "лот", "лотов", "объем", "объём", "кол", "шт"]);

/** Число с десятичной точкой или запятой. Экспоненты в торговых полях не ждём. */
const NUMBER = /^\d+(?:[.,]\d+)?$/;

const normalizeNumber = (token: string) => token.replace(",", ".");

/** Является ли слово торговой командой: только так запускаются торговые сценарии. */
export function tradingCommandName(text: string): TradingCommandName | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const word = trimmed.slice(1).split(/[\s@]+/)[0].toLowerCase();
  return (TRADING_COMMANDS as readonly string[]).includes(word)
    ? (word as TradingCommandName)
    : null;
}

export function parseTradingCommand(text: string): TradingCommand | null {
  const name = tradingCommandName(text);
  if (!name) return null;

  const rest = text.trim().split(/\s+/).slice(1);

  switch (name) {
    case "in":
    case "log":
      return { type: name, ...parseTradeInput(rest) };
    case "open":
    case "trades":
      return { type: name === "trades" ? "trades" : "open" };
    case "balance":
      return { type: "balance" };
    case "account":
    case "market":
    case "symbol":
      return { type: "account", account: rest.join(" ") || undefined };
    case "out": {
      const numbers = rest.filter((t) => NUMBER.test(t)).map(normalizeNumber);
      return {
        type: "out",
        price: numbers[0] ?? null,
        problems: numbers.length > 1 ? ["Укажите одну цену выхода."] : [],
      };
    }
    case "partial": {
      const numbers = rest.filter((t) => NUMBER.test(t)).map(normalizeNumber);
      return {
        type: "partial",
        quantity: numbers[0] ?? null,
        price: numbers[1] ?? null,
        problems:
          numbers.length > 2
            ? ["Ожидаю два числа: объём и цену."]
            : numbers.length < 2
              ? ["Нужны объём и цена: /partial 0.01 4680"]
              : [],
      };
    }
    case "stop": {
      const numbers = rest.filter((t) => NUMBER.test(t)).map(normalizeNumber);
      return {
        type: "stop",
        price: numbers[0] ?? null,
        problems: numbers.length === 0 ? ["Укажите новую цену стопа."] : [],
      };
    }
  }
}

/**
 * Быстрая форма: «XAUUSD buy 4650 sl 4632 tp 4700 0.01».
 *
 * Голые числа распределяются по порядку: первое — цена входа, второе — объём.
 * Если голых чисел больше двух, разбор не угадывает: лишнее число может быть
 * и ценой, и объёмом, а ошибка здесь стоит реальной записи в журнале.
 */
export function parseTradeInput(tokens: string[]): { input: TradeInput; problems: string[] } {
  const input: TradeInput = {
    symbol: null,
    direction: null,
    entry: null,
    stop: null,
    target: null,
    quantity: null,
  };
  const problems: string[] = [];
  const bare: string[] = [];
  const unknown: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const raw = tokens[i];
    const token = raw.toLowerCase();

    if (LONG_WORDS.has(token)) {
      input.direction = "long";
      continue;
    }
    if (SHORT_WORDS.has(token)) {
      input.direction = "short";
      continue;
    }

    const keyword = STOP_WORDS.has(token)
      ? "stop"
      : TARGET_WORDS.has(token)
        ? "target"
        : QTY_WORDS.has(token)
          ? "quantity"
          : null;

    if (keyword) {
      const next = tokens[i + 1];
      if (next && NUMBER.test(next)) {
        input[keyword] = normalizeNumber(next);
        i += 1;
      } else {
        problems.push(`После «${raw}» ожидается число.`);
      }
      continue;
    }

    // Слитная запись вида «sl4632».
    const glued = /^(sl|tp|стоп|цель)(\d+(?:[.,]\d+)?)$/i.exec(raw);
    if (glued) {
      const key = STOP_WORDS.has(glued[1].toLowerCase()) ? "stop" : "target";
      input[key] = normalizeNumber(glued[2]);
      continue;
    }

    if (NUMBER.test(token)) {
      bare.push(normalizeNumber(raw));
      continue;
    }

    // Похоже на символ инструмента: буквы, цифры, слеш, точка.
    if (/^[\p{L}\d][\p{L}\d./-]*$/u.test(raw)) {
      if (input.symbol === null) input.symbol = raw.toUpperCase().replace("/", "");
      else unknown.push(raw);
      continue;
    }

    unknown.push(raw);
  }

  if (bare.length > 0) input.entry = bare[0];
  if (bare.length > 1 && input.quantity === null) input.quantity = bare[1];
  if (bare.length > 2) {
    problems.push(
      `Не понял, что означает «${bare.slice(2).join(", ")}». Укажите объём явно: qty 0.01`,
    );
  }

  if (unknown.length > 0) {
    problems.push(`Непонятные слова: ${unknown.join(", ")}.`);
  }
  if (input.symbol === null) {
    problems.push("Не указан инструмент.");
  }
  if (input.direction === null) {
    problems.push("Не указано направление: buy или sell.");
  }
  if (input.entry === null) {
    problems.push("Не указана цена входа.");
  }
  if (input.quantity === null) {
    problems.push("Не указан объём.");
  }

  return { input, problems };
}

/** Краткая подсказка по торговым командам — дополняет помощь по расходам. */
export const TRADING_HELP = [
  "Торговля:",
  "/in XAUUSD buy 4650 sl 4632 tp 4700 0.01 — проверить план и записать вход",
  "/log … — записать уже совершённую сделку",
  "/open — открытые позиции",
  "/out 4700 — закрыть остаток",
  "/partial 0.01 4680 — закрыть часть",
  "/stop 4650 — перенести стоп",
  "/balance — баланс торгового счёта",
  "",
  "Обычный текст по-прежнему означает расход: «Такси 250».",
].join("\n");
