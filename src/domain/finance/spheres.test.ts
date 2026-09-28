import { describe, expect, it } from "vitest";
import { spendingByArea, unmappedCategories, type CategoryAreas } from "./spheres";
import type { Transaction } from "./stats";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  kind: "expense",
  amountMinor: 10000,
  currency: "KGS",
  category: "food",
  description: "",
  occurredAt: new Date("2026-09-26T10:00:00Z"),
  day: "2026-09-26",
  ...over,
});

const mapping: CategoryAreas = {
  food: "health",
  health: "health",
  education: "growth",
};

describe("расходы по сферам жизни", () => {
  it("складывает категории одной сферы и считает долю", () => {
    const r = spendingByArea(
      [
        tx({ category: "food", amountMinor: 30000 }),
        tx({ category: "health", amountMinor: 10000 }),
        tx({ category: "education", amountMinor: 10000 }),
      ],
      mapping,
    );

    expect(r.areas[0]).toMatchObject({ areaId: "health", amountMinor: 40000, count: 2 });
    expect(r.areas[0].categories.sort()).toEqual(["food", "health"]);
    expect(r.areas[0].share).toBeCloseTo(0.8);
    expect(r.mappedMinor).toBe(50000);
  });

  it("не приписывает несопоставленные категории ни к одной сфере", () => {
    const r = spendingByArea([tx({ category: "fun", amountMinor: 20000 })], mapping);
    expect(r.areas).toHaveLength(0);
    expect(r.mappedMinor).toBe(0);
    expect(r.unmappedMinor).toBe(20000);
  });

  it("возврат уменьшает сумму сферы и не считается покупкой", () => {
    const r = spendingByArea(
      [
        tx({ category: "food", amountMinor: 30000 }),
        tx({ category: "food", amountMinor: 10000, kind: "refund" }),
      ],
      mapping,
    );
    expect(r.areas[0]).toMatchObject({ amountMinor: 20000, count: 1 });
  });

  it("доходы в разрез не попадают", () => {
    const r = spendingByArea(
      [tx({ kind: "income", category: null, amountMinor: 100000 }), tx({ amountMinor: 5000 })],
      mapping,
    );
    expect(r.mappedMinor).toBe(5000);
    expect(r.unmappedMinor).toBe(0);
  });

  it("операции в другой валюте пропускаются — курс не выдумываем", () => {
    const r = spendingByArea([tx({ currency: "USD", amountMinor: 5000 })], mapping);
    expect(r.mappedMinor).toBe(0);
    expect(r.unmappedMinor).toBe(0);
  });

  it("пустая история не даёт долей и не делит на ноль", () => {
    const r = spendingByArea([], mapping);
    expect(r).toEqual({ areas: [], mappedMinor: 0, unmappedMinor: 0 });
  });

  it("подсказывает категории, которым сфера ещё не выбрана", () => {
    const list = unmappedCategories(
      [tx({ category: "fun" }), tx({ category: "fun" }), tx({ category: "food" })],
      mapping,
    );
    expect(list).toEqual(["fun"]);
  });
});
