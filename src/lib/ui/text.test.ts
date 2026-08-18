import { describe, expect, it } from "vitest";
import { cycleIndex, greeting, matchesQuery } from "./text";

describe("greeting", () => {
  const at = (h: number) => new Date(2026, 0, 1, h, 0, 0);
  it("утро/день/вечер/ночь по часам", () => {
    expect(greeting(at(2))).toBe("Доброй ночи");
    expect(greeting(at(9))).toBe("Доброе утро");
    expect(greeting(at(14))).toBe("Добрый день");
    expect(greeting(at(21))).toBe("Добрый вечер");
  });
});

describe("matchesQuery", () => {
  it("пустой запрос совпадает со всем", () => {
    expect(matchesQuery("Задача", "")).toBe(true);
  });
  it("подстрока без учёта регистра", () => {
    expect(matchesQuery("Создать задачу", "ЗАДАЧ")).toBe(true);
    expect(matchesQuery("Календарь", "план")).toBe(false);
  });
});

describe("cycleIndex", () => {
  it("вперёд и назад по кругу", () => {
    expect(cycleIndex(0, 1, 3)).toBe(1);
    expect(cycleIndex(2, 1, 3)).toBe(0);
    expect(cycleIndex(0, -1, 3)).toBe(2);
  });
  it("пустой список даёт 0", () => {
    expect(cycleIndex(0, 1, 0)).toBe(0);
  });
});
