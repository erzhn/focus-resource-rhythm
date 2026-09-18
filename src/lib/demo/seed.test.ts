import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { financialDayOf } from "@/domain/finance/day";

/**
 * Инвариант данных: финансовый день операции обязан выводиться из её времени.
 * Раньше в демо-наборе день брался общий, и у записи в 09:15 он мог оказаться
 * вчерашним, если приложение открыли до 01:00.
 */
describe("демо-операции согласованы по дню", () => {
  const atHour = (h: number) => {
    const d = new Date(2026, 8, 17, h, 30, 0);
    return d;
  };

  it("день совпадает со временем операции в обычный час", () => {
    for (const tx of createSeedState(atHour(14)).transactions) {
      expect(tx.day).toBe(financialDayOf(tx.occurredAt));
    }
  });

  it("день совпадает и когда приложение открыто до 01:00", () => {
    // Самый опасный момент: сутки учёта ещё не сменились.
    for (const tx of createSeedState(atHour(0)).transactions) {
      expect(tx.day).toBe(financialDayOf(tx.occurredAt));
    }
  });

  it("суммы положительные и в минорных единицах", () => {
    for (const tx of createSeedState(atHour(12)).transactions) {
      expect(tx.amountMinor).toBeGreaterThan(0);
      expect(Number.isInteger(tx.amountMinor)).toBe(true);
    }
  });

  it("у расходов есть категория, у доходов её нет", () => {
    for (const tx of createSeedState(atHour(12)).transactions) {
      if (tx.kind === "expense") expect(tx.category).not.toBeNull();
      else expect(tx.category).toBeNull();
    }
  });
});
