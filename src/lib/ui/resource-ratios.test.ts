import { describe, expect, it } from "vitest";
import { resourceRatios } from "./resource-ratios";

describe("resourceRatios", () => {
  it("считает доли времени/денег/сил и ограничивает кольцо единицей", () => {
    const r = resourceRatios({
      plannedMinutes: 300,
      plannableMinutes: 240,
      plannedMoney: 500,
      moneyLimit: 1000,
      energy: 4,
    });
    expect(r.time.raw).toBeCloseTo(1.25);
    expect(r.time.ratio).toBe(1); // ограничено сверху
    expect(r.time.over).toBe(true);
    expect(r.money!.ratio).toBe(0.5);
    expect(r.money!.over).toBe(false);
    expect(r.energy.ratio).toBeCloseTo(0.8);
  });

  it("без денежного лимита money === null", () => {
    const r = resourceRatios({
      plannedMinutes: 0,
      plannableMinutes: 240,
      plannedMoney: 0,
      moneyLimit: null,
      energy: 3,
    });
    expect(r.money).toBeNull();
  });

  it("нулевой лимит не делит на ноль", () => {
    const r = resourceRatios({
      plannedMinutes: 60,
      plannableMinutes: 0,
      plannedMoney: 0,
      moneyLimit: null,
      energy: 5,
    });
    expect(r.time.ratio).toBe(0);
    expect(r.time.over).toBe(false);
  });
});
