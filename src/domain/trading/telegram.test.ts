import { describe, expect, it } from "vitest";
import { parseTradeInput, parseTradingCommand, tradingCommandName } from "./telegram";
import { parseBotMessage } from "@/domain/finance/telegram";

/**
 * Разбор торговых команд.
 *
 * Отдельная проверка посвящена тому, что ввод расходов не сломался: это тот
 * же бот и тот же чат, и свободный текст должен по-прежнему означать трату.
 */

const words = (s: string) => s.trim().split(/\s+/);

describe("36. Ввод расходов не сломан торговыми командами", () => {
  it("свободный текст — не торговая команда", () => {
    expect(tradingCommandName("Такси 250")).toBeNull();
    expect(parseTradingCommand("Такси 250")).toBeNull();
    expect(parseTradingCommand("Кофе 180\nОбед 450")).toBeNull();
  });

  it("свободный текст по-прежнему разбирается как расход", () => {
    const cmd = parseBotMessage("Такси 250");
    expect(cmd.type).toBe("entries");
    if (cmd.type === "entries") {
      expect(cmd.parsed.entries[0]).toMatchObject({ amountMinor: 25000, kind: "expense" });
    }
  });

  it("команды расходов остались за разбором расходов", () => {
    for (const text of ["/today", "/month", "/undo", "/help"]) {
      expect(tradingCommandName(text)).toBeNull();
      expect(parseBotMessage(text).type).not.toBe("entries");
    }
  });

  it("торговые команды распознаются по имени, в том числе с именем бота", () => {
    expect(tradingCommandName("/in XAUUSD buy 4650")).toBe("in");
    expect(tradingCommandName("/open")).toBe("open");
    expect(tradingCommandName("/out@my_bot 4700")).toBe("out");
    expect(tradingCommandName("/IN XAUUSD")).toBe("in");
  });
});

describe("быстрая форма входа", () => {
  it("разбирает пример из постановки", () => {
    const { input, problems } = parseTradeInput(words("XAUUSD buy 4650 sl 4632 tp 4700 0.01"));
    expect(input).toEqual({
      symbol: "XAUUSD",
      direction: "long",
      entry: "4650",
      stop: "4632",
      target: "4700",
      quantity: "0.01",
    });
    expect(problems).toEqual([]);
  });

  it("разбирает акцию с явным объёмом", () => {
    const { input, problems } = parseTradeInput(words("AAPL buy 200 sl 195 tp 210 qty 2"));
    expect(input).toMatchObject({ symbol: "AAPL", entry: "200", quantity: "2", target: "210" });
    expect(problems).toEqual([]);
  });

  it("принимает русские слова и десятичную запятую", () => {
    const { input } = parseTradeInput(words("EURUSD продажа 1,1000 стоп 1,1050 0,01"));
    expect(input).toMatchObject({
      direction: "short",
      entry: "1.1000",
      stop: "1.1050",
      quantity: "0.01",
    });
  });

  it("принимает слитную запись sl4632", () => {
    const { input } = parseTradeInput(words("XAUUSD buy 4650 sl4632 0.01"));
    expect(input).toMatchObject({ stop: "4632", entry: "4650", quantity: "0.01" });
  });

  it("цель необязательна", () => {
    const { input, problems } = parseTradeInput(words("XAUUSD buy 4650 sl 4632 0.01"));
    expect(input.target).toBeNull();
    expect(problems).toEqual([]);
  });

  it("слеш в символе убирается", () => {
    expect(parseTradeInput(words("EUR/USD buy 1.1 0.01")).input.symbol).toBe("EURUSD");
  });

  it("без символа не подставляет золото молча", () => {
    const { input, problems } = parseTradeInput(words("buy 4650 sl 4632 0.01"));
    expect(input.symbol).toBeNull();
    expect(problems).toContain("Не указан инструмент.");
  });

  it("лишнее голое число не распределяется наугад", () => {
    const { problems } = parseTradeInput(words("XAUUSD buy 4650 0.01 777"));
    expect(problems.some((p) => p.includes("777"))).toBe(true);
  });

  it("ключевое слово без числа — это вопрос, а не молчание", () => {
    const { problems } = parseTradeInput(words("XAUUSD buy 4650 sl tp 4700 0.01"));
    expect(problems.some((p) => p.includes("«sl»"))).toBe(true);
  });

  it("число сразу после sl считается стопом, а не объёмом", () => {
    // «sl 0.01» — это стоп 0.01, каким бы странным он ни выглядел.
    // Переставлять поля за пользователя нельзя: он сам видит, что ввёл.
    const { input, problems } = parseTradeInput(words("XAUUSD buy 4650 sl 0.01"));
    expect(input.stop).toBe("0.01");
    expect(problems).toContain("Не указан объём.");
  });

  it("перечисляет всё, чего не хватает", () => {
    const { problems } = parseTradeInput([]);
    expect(problems).toEqual([
      "Не указан инструмент.",
      "Не указано направление: buy или sell.",
      "Не указана цена входа.",
      "Не указан объём.",
    ]);
  });
});

describe("команды управления позицией", () => {
  it("/out с ценой", () => {
    expect(parseTradingCommand("/out 4700")).toEqual({ type: "out", price: "4700", problems: [] });
  });

  it("/out без цены спросит её позже, а не закроет наугад", () => {
    const cmd = parseTradingCommand("/out");
    expect(cmd).toMatchObject({ type: "out", price: null });
  });

  it("/partial требует объём и цену", () => {
    expect(parseTradingCommand("/partial 0.01 4680")).toEqual({
      type: "partial",
      quantity: "0.01",
      price: "4680",
      problems: [],
    });
    const incomplete = parseTradingCommand("/partial 0.01");
    expect(incomplete).toMatchObject({ type: "partial" });
    if (incomplete && incomplete.type === "partial") {
      expect(incomplete.problems).toHaveLength(1);
    }
  });

  it("/stop требует цену", () => {
    expect(parseTradingCommand("/stop 4650")).toEqual({ type: "stop", price: "4650", problems: [] });
    const empty = parseTradingCommand("/stop");
    expect(empty).toMatchObject({ type: "stop", price: null });
  });

  it("/open и /balance без аргументов", () => {
    expect(parseTradingCommand("/open")).toEqual({ type: "open" });
    expect(parseTradingCommand("/balance")).toEqual({ type: "balance" });
  });
});
