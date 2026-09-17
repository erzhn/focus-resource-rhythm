import { describe, expect, it } from "vitest";
import {
  dueDayInMonth, dueFinancialDay, monthlyCommitmentMinor,
  upcomingThisMonth, type RecurringExpense,
} from "./recurring";
import { toCsv } from "./export";
import type { Transaction } from "./stats";

const item = (
  id: string,
  amount: number,
  dayOfMonth: number,
  active = true,
  currency = "KGS",
): RecurringExpense => ({
  id,
  title: `Платёж ${id}`,
  amountMinor: amount * 100,
  currency,
  category: "home",
  dayOfMonth,
  active,
});

describe("dueDayInMonth", () => {
  it("обычный месяц", () => {
    expect(dueDayInMonth(15, 2026, 9)).toBe(15);
  });
  it("31-е в 30-дневном месяце переносится на последний день", () => {
    expect(dueDayInMonth(31, 2026, 9)).toBe(30);
  });
  it("31-е в феврале — на 28-е", () => {
    expect(dueDayInMonth(31, 2026, 2)).toBe(28);
  });
  it("в високосном феврале — на 29-е", () => {
    expect(dueDayInMonth(31, 2028, 2)).toBe(29);
  });
});

describe("dueFinancialDay", () => {
  it("собирает ярлык дня с ведущими нулями", () => {
    expect(dueFinancialDay(item("a", 100, 5), "2026-09")).toBe("2026-09-05");
  });
});

describe("upcomingThisMonth", () => {
  const items = [item("rent", 20000, 5), item("net", 1500, 20), item("gym", 3000, 25, false)];

  it("берёт только будущие списания текущего месяца", () => {
    const r = upcomingThisMonth(items, "2026-09-10");
    expect(r.upcoming.map((u) => u.item.id)).toEqual(["net"]);
    expect(r.totalMinor).toBe(150_000);
  });

  it("списание сегодня считается предстоящим", () => {
    const r = upcomingThisMonth(items, "2026-09-20");
    expect(r.upcoming.map((u) => u.item.id)).toEqual(["net"]);
  });

  it("выключенные не учитываются", () => {
    const r = upcomingThisMonth(items, "2026-09-01");
    expect(r.upcoming.map((u) => u.item.id)).toEqual(["rent", "net"]);
    expect(r.totalMinor).toBe(2_150_000);
  });

  it("другая валюта не попадает в сумму основной", () => {
    const r = upcomingThisMonth([item("vps", 10, 15, true, "USD")], "2026-09-01");
    expect(r.upcoming).toHaveLength(1);
    expect(r.totalMinor).toBe(0);
  });
});

describe("monthlyCommitmentMinor", () => {
  it("суммирует только активные в основной валюте", () => {
    expect(monthlyCommitmentMinor([item("a", 100, 1), item("b", 50, 2, false)])).toBe(10_000);
  });
});

describe("toCsv", () => {
  const tx = (description: string, amount: number): Transaction => ({
    id: "1",
    kind: "expense",
    amountMinor: amount * 100,
    currency: "KGS",
    category: "food",
    description,
    occurredAt: new Date(2026, 8, 16, 14, 30),
    day: "2026-09-16",
  });

  it("начинается с BOM — иначе Excel ломает кириллицу", () => {
    expect(toCsv([tx("Кофе", 180)]).startsWith("﻿")).toBe(true);
  });

  it("разделитель — точка с запятой, десятичная запятая", () => {
    const csv = toCsv([tx("Кофе", 180)]);
    expect(csv).toContain("Расход;Еда и напитки;Кофе;180,00;KGS");
  });

  it("экранирует кавычки и разделитель в описании", () => {
    const csv = toCsv([tx('Кафе "Прага"; обед', 500)]);
    expect(csv).toContain('"Кафе ""Прага""; обед"');
  });

  it("заголовок присутствует всегда", () => {
    expect(toCsv([])).toContain("Финансовый день");
  });
});
