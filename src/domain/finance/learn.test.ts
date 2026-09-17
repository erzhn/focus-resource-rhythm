import { describe, expect, it } from "vitest";
import { descriptionKey, learnCategories, suggestCategory } from "./learn";
import type { CategoryId } from "./categories";

const seen = (description: string, category: CategoryId, dayOffset = 0) => ({
  description,
  category,
  occurredAt: new Date(2026, 8, 10 + dayOffset),
});

describe("descriptionKey", () => {
  it("нормализует регистр, ё и пробелы", () => {
    expect(descriptionKey("  Пёкарня   У Дома ")).toBe("пекарня у дома");
  });
});

describe("learnCategories", () => {
  it("запоминает категорию по описанию", () => {
    const learned = learnCategories([seen("Глобус", "food")]);
    expect(suggestCategory("глобус", learned)).toBe("food");
  });

  it("берёт самую частую категорию", () => {
    const learned = learnCategories([
      seen("Глобус", "food"),
      seen("Глобус", "food"),
      seen("Глобус", "home"),
    ]);
    expect(suggestCategory("Глобус", learned)).toBe("food");
  });

  it("при равенстве выбирает более свежую", () => {
    const learned = learnCategories([seen("Точка", "food", 0), seen("Точка", "tech", 5)]);
    expect(suggestCategory("Точка", learned)).toBe("tech");
  });

  it("находит известное описание внутри строки", () => {
    const learned = learnCategories([seen("Глобус", "food")]);
    expect(suggestCategory("Глобус продукты на неделю", learned)).toBe("food");
  });

  it("из нескольких совпадений берёт более конкретное", () => {
    const learned = learnCategories([seen("кофе", "food"), seen("кофемашина", "tech")]);
    expect(suggestCategory("купил кофемашину", learned)).toBe("tech");
  });

  it("короткие описания не ловятся как подстрока", () => {
    const learned = learnCategories([seen("ак", "tech")]);
    expect(suggestCategory("такси до вокзала", learned)).toBeNull();
  });

  it("незнакомое описание не получает категорию", () => {
    const learned = learnCategories([seen("Глобус", "food")]);
    expect(suggestCategory("Ремонт замка", learned)).toBeNull();
  });

  it("пустая история ничего не подсказывает", () => {
    expect(suggestCategory("что угодно", learnCategories([]))).toBeNull();
  });
});
