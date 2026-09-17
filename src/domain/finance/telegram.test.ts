import { describe, expect, it } from "vitest";
import { escapeHtml, parseBotMessage } from "./telegram";
import { dailyReport } from "./report";
import { summarizeDay, summarizeMonth, budgetStatus, type Transaction } from "./stats";

describe("parseBotMessage", () => {
  it("/start без кода", () => {
    expect(parseBotMessage("/start")).toEqual({ type: "start", code: null });
  });

  it("/start с кодом", () => {
    expect(parseBotMessage("/start ABC123")).toEqual({ type: "start", code: "ABC123" });
  });

  it("команда с именем бота (как в группах)", () => {
    expect(parseBotMessage("/today@my_finance_bot")).toEqual({ type: "today" });
  });

  it("русские синонимы команд", () => {
    expect(parseBotMessage("/месяц")).toEqual({ type: "month" });
    expect(parseBotMessage("/отмена")).toEqual({ type: "undo" });
  });

  it("незнакомая команда показывает справку", () => {
    expect(parseBotMessage("/чтотоне")).toEqual({ type: "help" });
  });

  it("обычный текст разбирается как операции", () => {
    const r = parseBotMessage("Такси 250");
    expect(r.type).toBe("entries");
    if (r.type === "entries") {
      expect(r.parsed.entries[0].amountMinor).toBe(25_000);
      expect(r.parsed.entries[0].category).toBe("transport");
    }
  });

  it("несколько строк — несколько операций", () => {
    const r = parseBotMessage("Кофе 180\nТакси 250");
    if (r.type === "entries") expect(r.parsed.entries).toHaveLength(2);
  });

  it("пустое сообщение", () => {
    expect(parseBotMessage("   ")).toEqual({ type: "empty" });
  });
});

describe("escapeHtml", () => {
  it("экранирует угловые скобки и амперсанд", () => {
    expect(escapeHtml('<b>&"')).toBe('&lt;b&gt;&amp;"');
  });
});

describe("dailyReport", () => {
  const DAY = "2026-09-16";
  const tx = (
    amount: number,
    kind: Transaction["kind"] = "expense",
    category: Transaction["category"] = "food",
    description = "покупка",
  ): Transaction => ({
    id: Math.random().toString(),
    kind,
    amountMinor: amount * 100,
    currency: "KGS",
    category,
    description,
    occurredAt: new Date(`${DAY}T10:00:00Z`),
    day: DAY,
  });

  // toLocaleString("ru-RU") разделяет тысячи НЕРАЗРЫВНЫМ пробелом. Приводим к
  // обычному, чтобы в тексте теста не было невидимых символов.
  const normalize = (s: string) => s.replace(/ /g, " ");

  const build = (list: Transaction[], limit: number | null = null) => {
    const today = summarizeDay(list, DAY);
    return normalize(dailyReport({
      day: DAY,
      today,
      month: summarizeMonth(list, DAY),
      currency: "KGS",
      dayBudget: budgetStatus(today.expensesMinor, limit),
      balanceMinor: null,
    }));
  };

  it("содержит заголовок, доходы и расходы", () => {
    const r = build([tx(1200), tx(20000, "income", null, "Зарплата")]);
    expect(r).toContain("ОТЧЁТ ЗА 16 СЕНТЯБРЯ");
    expect(r).toContain("Доходы: +20 000 сом");
    expect(r).toContain("Расходы: −1 200 сом");
  });

  it("перечисляет категории и крупнейший расход", () => {
    const r = build([tx(1200, "expense", "food"), tx(800, "expense", "shopping", "Футболка")]);
    expect(r).toContain("Еда и напитки — 1 200 сом");
    expect(r).toContain("Количество покупок: 2");
    expect(r).toContain("Самая затратная категория: Еда и напитки");
    expect(r).toContain("Крупнейший расход: 1 200 сом");
  });

  it("сообщает о превышении бюджета", () => {
    expect(build([tx(1850)], 150_000)).toContain("Дневной бюджет превышен на 350 сом");
  });

  it("показывает остаток бюджета, когда он не превышен", () => {
    expect(build([tx(1200)], 150_000)).toContain("осталось 300 сом");
  });

  it("пустой день не выдумывает цифры", () => {
    const r = build([]);
    expect(r).toContain("Расходов за день не было");
  });
});
