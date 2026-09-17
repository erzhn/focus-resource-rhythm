import { describe, expect, it } from "vitest";
import { budgetStatus, computeBalance, summarizeDay, summarizeMonth, type Transaction } from "./stats";

let seq = 0;
const tx = (
  day: string,
  amount: number,
  kind: Transaction["kind"] = "expense",
  category: Transaction["category"] = "food",
  currency = "KGS",
): Transaction => ({
  id: `t${++seq}`,
  kind,
  amountMinor: amount * 100,
  currency,
  category,
  description: "тест",
  occurredAt: new Date(`${day}T10:00:00Z`),
  day,
});

const DAY = "2026-09-16";

describe("summarizeDay", () => {
  it("считает расходы, доходы и количество покупок", () => {
    const s = summarizeDay(
      [tx(DAY, 1200), tx(DAY, 450, "expense", "transport"), tx(DAY, 20000, "income", null)],
      DAY,
    );
    expect(s.expensesMinor).toBe(165_000);
    expect(s.incomeMinor).toBe(2_000_000);
    expect(s.count).toBe(2);
  });

  it("операции других дней не попадают в сводку", () => {
    const s = summarizeDay([tx(DAY, 100), tx("2026-09-15", 999)], DAY);
    expect(s.expensesMinor).toBe(10_000);
  });

  it("категории отсортированы по убыванию с долями", () => {
    const s = summarizeDay(
      [tx(DAY, 1200, "expense", "food"), tx(DAY, 800, "expense", "shopping"), tx(DAY, 400, "expense", "transport")],
      DAY,
    );
    expect(s.byCategory.map((c) => c.category)).toEqual(["food", "shopping", "transport"]);
    expect(s.byCategory[0].share).toBeCloseTo(1200 / 2400);
  });

  it("расход без категории попадает в «Другое»", () => {
    const s = summarizeDay([tx(DAY, 700, "expense", null)], DAY);
    expect(s.byCategory[0].category).toBe("other");
  });

  it("находит крупнейший расход", () => {
    const s = summarizeDay([tx(DAY, 300), tx(DAY, 1500, "expense", "shopping")], DAY);
    expect(s.largest?.amountMinor).toBe(150_000);
  });

  it("возврат уменьшает чистые расходы, но не доход", () => {
    const s = summarizeDay([tx(DAY, 3000), tx(DAY, 1000, "refund", null)], DAY);
    expect(s.expensesMinor).toBe(300_000);
    expect(s.refundsMinor).toBe(100_000);
    expect(s.netExpensesMinor).toBe(200_000);
    expect(s.incomeMinor).toBe(0);
  });

  it("другая валюта считается отдельно и не смешивается", () => {
    const s = summarizeDay([tx(DAY, 1000), tx(DAY, 50, "expense", "tech", "USD")], DAY);
    expect(s.expensesMinor).toBe(100_000);
    expect(s.otherCurrencies).toEqual([{ currency: "USD", expensesMinor: 5_000, incomeMinor: 0 }]);
  });

  it("пустой день не ломается", () => {
    const s = summarizeDay([], DAY);
    expect(s.expensesMinor).toBe(0);
    expect(s.largest).toBeNull();
    expect(s.byCategory).toEqual([]);
  });
});

describe("summarizeMonth", () => {
  it("берёт весь календарный месяц", () => {
    const s = summarizeMonth([tx("2026-09-01", 100), tx("2026-09-30", 200), tx("2026-08-31", 999)], DAY);
    expect(s.expensesMinor).toBe(30_000);
  });
});

describe("budgetStatus", () => {
  it("считает остаток и долю", () => {
    const b = budgetStatus(120_000, 150_000)!;
    expect(b.leftMinor).toBe(30_000);
    expect(b.ratio).toBeCloseTo(0.8);
    expect(b.over).toBe(false);
  });

  it("сообщает о превышении и на сколько", () => {
    const b = budgetStatus(185_000, 150_000)!;
    expect(b.over).toBe(true);
    expect(b.overByMinor).toBe(35_000);
    expect(b.leftMinor).toBe(-35_000);
  });

  it("без лимита возвращает null", () => {
    expect(budgetStatus(1000, null)).toBeNull();
    expect(budgetStatus(1000, 0)).toBeNull();
  });
});

describe("computeBalance", () => {
  it("начальный + доходы − расходы", () => {
    const b = computeBalance([tx(DAY, 20000, "income", null), tx(DAY, 5000)], 100_000);
    expect(b).toBe(100_000 + 2_000_000 - 500_000);
  });

  it("возврат возвращает деньги в баланс", () => {
    expect(computeBalance([tx(DAY, 1000, "refund", null)], 0)).toBe(100_000);
  });

  it("без начального баланса не придумывает его", () => {
    expect(computeBalance([tx(DAY, 100)], null)).toBeNull();
  });

  it("чужая валюта не влияет на баланс основной", () => {
    expect(computeBalance([tx(DAY, 50, "expense", "tech", "USD")], 100_000)).toBe(100_000);
  });
});
