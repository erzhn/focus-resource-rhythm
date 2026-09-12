import { describe, expect, it } from "vitest";
import { consume, limitKey, type WindowState } from "./window";

const LIMIT = 3;
const WINDOW = 60_000;

describe("consume", () => {
  it("первый запрос разрешён и открывает окно", () => {
    const d = consume(null, 1000, LIMIT, WINDOW);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(2);
    expect(d.next).toEqual({ windowStart: 1000, count: 1 });
  });

  it("считает запросы внутри окна и блокирует после лимита", () => {
    let st: WindowState | null = null;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const d = consume(st, 1000 + i * 100, LIMIT, WINDOW);
      st = d.next;
      results.push(d.allowed);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("окно сбрасывается по истечении", () => {
    const st: WindowState = { windowStart: 1000, count: 99 };
    const d = consume(st, 1000 + WINDOW, LIMIT, WINDOW);
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStart: 61_000, count: 1 });
  });

  it("сообщает, через сколько окно освободится", () => {
    const st: WindowState = { windowStart: 1000, count: 5 };
    const d = consume(st, 1000 + 20_000, LIMIT, WINDOW);
    expect(d.allowed).toBe(false);
    expect(d.resetInMs).toBe(40_000);
  });

  it("remaining не уходит в минус", () => {
    const st: WindowState = { windowStart: 1000, count: 10 };
    expect(consume(st, 1500, LIMIT, WINDOW).remaining).toBe(0);
  });
});

describe("limitKey", () => {
  it("нормализует регистр и пробелы", () => {
    expect(limitKey("login", "  User@Example.COM ")).toBe("login:user@example.com");
  });
  it("обрезает слишком длинный субъект", () => {
    expect(limitKey("x", "a".repeat(300)).length).toBeLessThanOrEqual(122);
  });
});
