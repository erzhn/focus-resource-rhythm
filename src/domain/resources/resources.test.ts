import { describe, expect, it } from "vitest";
import {
  checkLimit,
  clampReserveRatio,
  energyBand,
  plannableMinutes,
  reserveMinutes,
} from "./index";

describe("резерв времени (20–30%)", () => {
  it("приводит долю резерва к диапазону 20–30%", () => {
    expect(clampReserveRatio(0.1)).toBe(0.2);
    expect(clampReserveRatio(0.5)).toBe(0.3);
    expect(clampReserveRatio(0.25)).toBe(0.25);
  });

  it("25% резерва от 480 минут = 120 минут резерва и 360 плановых", () => {
    expect(reserveMinutes(480, 0.25)).toBe(120);
    expect(plannableMinutes(480, 0.25)).toBe(360);
  });

  it("резерв ниже 20% всё равно удерживается на 20%", () => {
    expect(reserveMinutes(480, 0.05)).toBe(96); // 20% от 480
  });
});

describe("уровень сил → полоса", () => {
  it("1–2 = низкие, 3 = средние, 4–5 = высокие", () => {
    expect(energyBand(1)).toBe("low");
    expect(energyBand(2)).toBe("low");
    expect(energyBand(3)).toBe("medium");
    expect(energyBand(4)).toBe("high");
    expect(energyBand(5)).toBe("high");
  });
});

describe("проверка лимитов", () => {
  it("без лимита предупреждений нет", () => {
    expect(checkLimit(1000, null, "сом").exceeded).toBe(false);
  });

  it("превышение лимита даёт предупреждение, но не блокирует", () => {
    const c = checkLimit(120, 100, "мин");
    expect(c.exceeded).toBe(true);
    expect(c.message).toContain("превышает");
  });

  it("почти исчерпанный лимит помечается nearLimit", () => {
    const c = checkLimit(95, 100, "сом");
    expect(c.exceeded).toBe(false);
    expect(c.nearLimit).toBe(true);
  });
});
