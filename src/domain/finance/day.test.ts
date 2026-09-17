import { describe, expect, it } from "vitest";
import {
  financialDayOf, financialDayRange, formatFinancialDay,
  lastFinancialDays, monthOf, shiftFinancialDay,
} from "./day";

/** Момент по бишкекскому времени (UTC+6) в виде абсолютной даты. */
const bishkek = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min) - 6 * 60 * 60_000);

describe("financialDayOf", () => {
  it("день начинается в 01:00", () => {
    expect(financialDayOf(bishkek(2026, 9, 16, 1, 0))).toBe("2026-09-16");
  });

  it("00:30 относится ещё к предыдущему дню", () => {
    expect(financialDayOf(bishkek(2026, 9, 16, 0, 30))).toBe("2026-09-15");
  });

  it("00:59 — последняя минута предыдущего дня", () => {
    expect(financialDayOf(bishkek(2026, 9, 16, 0, 59))).toBe("2026-09-15");
  });

  it("середина дня и поздний вечер — тот же день", () => {
    expect(financialDayOf(bishkek(2026, 9, 16, 14, 0))).toBe("2026-09-16");
    expect(financialDayOf(bishkek(2026, 9, 16, 23, 59))).toBe("2026-09-16");
  });

  it("переход через начало месяца", () => {
    expect(financialDayOf(bishkek(2026, 10, 1, 0, 30))).toBe("2026-09-30");
    expect(financialDayOf(bishkek(2026, 10, 1, 1, 0))).toBe("2026-10-01");
  });

  it("переход через Новый год", () => {
    expect(financialDayOf(bishkek(2027, 1, 1, 0, 15))).toBe("2026-12-31");
  });

  it("високосный год", () => {
    expect(financialDayOf(bishkek(2028, 3, 1, 0, 30))).toBe("2028-02-29");
  });
});

describe("financialDayRange", () => {
  it("границы дня совпадают с 01:00 и следующим 01:00", () => {
    const { start, end } = financialDayRange("2026-09-16");
    expect(financialDayOf(start)).toBe("2026-09-16");
    expect(financialDayOf(new Date(end.getTime() - 1))).toBe("2026-09-16");
    expect(financialDayOf(end)).toBe("2026-09-17");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60_000);
  });

  it("момент до начала не попадает в диапазон", () => {
    const { start } = financialDayRange("2026-09-16");
    expect(financialDayOf(new Date(start.getTime() - 1))).toBe("2026-09-15");
  });
});

describe("вспомогательные", () => {
  it("shiftFinancialDay через границу месяца", () => {
    expect(shiftFinancialDay("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftFinancialDay("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("monthOf", () => {
    expect(monthOf("2026-09-16")).toBe("2026-09");
  });
  it("formatFinancialDay", () => {
    expect(formatFinancialDay("2026-09-16")).toBe("16 сентября");
  });
  it("lastFinancialDays возвращает дни по возрастанию, включая сегодня", () => {
    expect(lastFinancialDays("2026-09-16", 3)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });
});
