import { describe, expect, it } from "vitest";
import {
  DASH,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatR,
  signOf,
} from "./format";

/** Узкий неразрывный пробел между разрядами и обычный неразрывный перед единицей. */
const n = (s: string) => s.replace(/ /g, "_").replace(/ /g, "~").replace(/−/g, "-");

describe("деньги", () => {
  it("группирует разряды и ставит символ слева", () => {
    expect(n(formatMoney("1234.5", "USD"))).toBe("$1_234.5");
    expect(n(formatMoney("1000000", "USD"))).toBe("$1_000_000");
  });

  it("словесную валюту ставит справа", () => {
    expect(n(formatMoney("2380", "KGS"))).toBe("2_380~сом");
  });

  it("не округляет вверх при обрезке", () => {
    // 49.999 показывается как 49.99, а не 50: завышенный результат хуже.
    expect(n(formatMoney("49.999", "USD"))).toBe("$49.99");
  });

  it("убирает хвостовые нули", () => {
    expect(n(formatMoney("18.00", "USD"))).toBe("$18");
    expect(n(formatMoney("18.50", "USD"))).toBe("$18.5");
  });

  it("минус печатается типографским знаком", () => {
    expect(n(formatMoney("-10", "USD"))).toBe("-$10");
  });

  it("плюс показывается только по запросу", () => {
    expect(n(formatMoney("49", "USD", { signed: true }))).toBe("+$49");
    expect(n(formatMoney("49", "USD"))).toBe("$49");
  });

  it("не теряет точность на больших числах", () => {
    // Это то самое значение, на котором JSON.parse теряет восемь знаков.
    expect(n(formatMoney("10000000000.12345678", "USD", { maxFraction: 8 }))).toBe(
      "$10_000_000_000.12345678",
    );
  });

  it("неизвестное — прочерк, а не ноль", () => {
    expect(formatMoney(null, "USD")).toBe(DASH);
    expect(formatMoney(undefined, "USD")).toBe(DASH);
    expect(formatMoney("не число", "USD")).toBe(DASH);
  });
});

describe("R, проценты, цены и объёмы", () => {
  it("R обрезается до двух знаков и подписывается", () => {
    expect(n(formatR("2.7777777778"))).toBe("2.77R");
    expect(n(formatR("-0.2777777778"))).toBe("-0.27R");
    expect(n(formatR("2"))).toBe("2R");
  });

  it("R неизвестен — прочерк, а не 0R", () => {
    expect(formatR(null)).toBe(DASH);
    expect(formatR(null)).not.toBe("0R");
  });

  it("проценты", () => {
    expect(n(formatPercent("25.714286"))).toBe("25.71~%");
    expect(formatPercent(null)).toBe(DASH);
  });

  it("цена сохраняет записанные знаки", () => {
    expect(n(formatPrice("1.10000"))).toBe("1.1");
    expect(n(formatPrice("60000"))).toBe("60_000");
  });

  it("объём всегда с единицей", () => {
    expect(n(formatQuantity("0.01", "lot"))).toBe("0.01~лоты");
    expect(n(formatQuantity("2", "share"))).toBe("2~штуки");
    expect(n(formatQuantity("0.01", "coin"))).toBe("0.01~монеты");
  });
});

describe("знак величины", () => {
  it("различает ноль и неизвестность", () => {
    expect(signOf("0")).toBe("zero");
    expect(signOf("0.00")).toBe("zero");
    expect(signOf(null)).toBe("unknown");
    expect(signOf("12")).toBe("positive");
    expect(signOf("-0.5")).toBe("negative");
  });

  it("минус ноль не считается отрицательным", () => {
    expect(signOf("-0.00")).toBe("zero");
  });
});
