import { describe, expect, it } from "vitest";
import {
  abs,
  add,
  cmp,
  dec,
  div,
  floorToStep,
  mul,
  round,
  sub,
  sum,
  toString,
  toTrimmedString,
  truncate,
} from "./decimal";

const s = toTrimmedString;

describe("разбор и печать", () => {
  it("хранит масштаб как записано", () => {
    expect(toString(dec("1.50"))).toBe("1.50");
    expect(toString(dec("2"))).toBe("2");
    expect(toString(dec("-0.001"))).toBe("-0.001");
  });

  it("убирает хвостовые нули по запросу", () => {
    expect(s(dec("1.50"))).toBe("1.5");
    expect(s(dec("2.000"))).toBe("2");
    expect(s(dec("-0.000"))).toBe("0");
  });

  it("принимает число и bigint", () => {
    expect(s(dec(0.25))).toBe("0.25");
    expect(s(dec(100n))).toBe("100");
  });

  it("отвергает мусор и экспоненциальную запись", () => {
    expect(() => dec("")).toThrow();
    expect(() => dec("1,5")).toThrow();
    expect(() => dec("около ста")).toThrow();
    expect(() => dec("1e-7")).toThrow();
    expect(() => dec(1e-7)).toThrow();
  });
});

describe("арифметика", () => {
  it("складывает без ошибки двоичных дробей", () => {
    // Ради этого всё и написано: 0.1 + 0.2 в JS-числах даёт 0.30000000000000004.
    expect(s(add(dec("0.1"), dec("0.2")))).toBe("0.3");
  });

  it("не накапливает ошибку на длинной сумме", () => {
    const items = Array.from({ length: 1000 }, () => dec("0.01"));
    expect(s(sum(items))).toBe("10");
  });

  it("вычитает и берёт модуль", () => {
    expect(s(sub(dec("4650"), dec("4632")))).toBe("18");
    expect(s(abs(sub(dec("4632"), dec("4650"))))).toBe("18");
  });

  it("умножает точно, складывая масштабы", () => {
    expect(s(mul(dec("18"), mul(dec("0.01"), dec("100"))))).toBe("18");
    expect(s(mul(dec("0.0000001"), dec("0.0000001")))).toBe("0.00000000000001");
  });

  it("делит с заданным масштабом и округляет половину вверх", () => {
    expect(toString(div(dec("50"), dec("18"), 10))).toBe("2.7777777778");
    expect(toString(div(dec("1"), dec("3"), 4))).toBe("0.3333");
    expect(toString(div(dec("2"), dec("3"), 4))).toBe("0.6667");
    expect(toString(div(dec("-50"), dec("18"), 4))).toBe("-2.7778");
  });

  it("делит, когда масштаб делимого больше требуемого", () => {
    expect(toString(div(dec("0.00000001"), dec("4"), 2))).toBe("0.00");
    expect(toString(div(dec("1.23456789"), dec("1"), 2))).toBe("1.23");
  });

  it("деление на ноль — ошибка вызывающего кода, а не тихий ноль", () => {
    expect(() => div(dec("1"), dec("0"), 2)).toThrow("Деление на ноль");
  });
});

describe("округление", () => {
  it("round — половина вверх по модулю", () => {
    expect(toString(round(dec("2.5"), 0))).toBe("3");
    expect(toString(round(dec("-2.5"), 0))).toBe("-3");
    expect(toString(round(dec("2.4"), 0))).toBe("2");
    expect(toString(round(dec("1.005"), 2))).toBe("1.01");
  });

  it("truncate отбрасывает хвост, не завышая", () => {
    expect(toString(truncate(dec("2.99"), 0))).toBe("2");
    expect(toString(truncate(dec("-2.99"), 0))).toBe("-2");
  });
});

describe("сетка объёмов", () => {
  it("округляет только вниз к допустимому значению", () => {
    expect(s(floorToStep(dec("0.137"), dec("0.01")))).toBe("0.13");
    expect(s(floorToStep(dec("0.02"), dec("0.01")))).toBe("0.02");
  });

  it("учитывает минимальный объём как начало сетки", () => {
    expect(s(floorToStep(dec("0.137"), dec("0.05"), dec("0.01")))).toBe("0.11");
  });

  it("ниже минимального объёма возвращает сам минимум — решение о допустимости принимается выше", () => {
    expect(s(floorToStep(dec("0.002"), dec("0.01"), dec("0.01")))).toBe("0.01");
  });

  it("нулевой шаг — ошибка", () => {
    expect(() => floorToStep(dec("1"), dec("0"))).toThrow();
  });
});

describe("сравнение", () => {
  it("сравнивает значения с разными масштабами", () => {
    expect(cmp(dec("1.50"), dec("1.5"))).toBe(0);
    expect(cmp(dec("1.5"), dec("1.50001"))).toBe(-1);
    expect(cmp(dec("-1"), dec("-2"))).toBe(1);
  });
});
