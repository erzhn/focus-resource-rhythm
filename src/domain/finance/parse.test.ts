import { describe, expect, it } from "vitest";
import { parseEntries, parseLine } from "./parse";

const p = (s: string) => parseLine(s)!;

describe("сумма", () => {
  it("простой случай «Такси 250»", () => {
    const e = p("Такси 250");
    expect(e.amountMinor).toBe(25_000);
    expect(e.description).toBe("Такси");
  });

  it("сумма перед описанием", () => {
    expect(p("250 такси").amountMinor).toBe(25_000);
  });

  it("пробел как разделитель тысяч", () => {
    expect(p("Футболка 1 500").amountMinor).toBe(150_000);
  });

  it("точка как разделитель тысяч", () => {
    expect(p("Ноутбук 45.000").amountMinor).toBe(4_500_000);
  });

  it("две цифры после запятой — это копейки", () => {
    expect(p("Кофе 250,50").amountMinor).toBe(25_050);
  });

  it("суффикс «к» умножает на тысячу", () => {
    expect(p("Зарплата 20к").amountMinor).toBe(2_000_000);
    expect(p("Аванс 1,5к").amountMinor).toBe(150_000);
  });

  it("берёт наибольшее число: количество не путается с ценой", () => {
    expect(p("Кофе 2 шт 180").amountMinor).toBe(18_000);
  });

  it("строка без суммы не разбирается", () => {
    expect(parseLine("просто заметка")).toBeNull();
    expect(parseLine("   ")).toBeNull();
  });
});

describe("валюта", () => {
  it("по умолчанию сом", () => {
    expect(p("Обед 300").currency).toBe("KGS");
  });
  it("распознаёт доллары и убирает их из описания", () => {
    const e = p("Подписка 10$");
    expect(e.currency).toBe("USD");
    expect(e.description).toBe("Подписка");
  });
  it("распознаёт рубли словом", () => {
    expect(p("Перевод 500 руб").currency).toBe("RUB");
  });
  it("слово «сом» не остаётся в описании", () => {
    expect(p("Такси 250 сом").description).toBe("Такси");
  });
});

describe("тип операции и категория", () => {
  it("расход с категорией", () => {
    const e = p("Такси 250");
    expect(e.kind).toBe("expense");
    expect(e.category).toBe("transport");
  });

  it("доход определяется по ключевому слову", () => {
    const e = p("Зарплата 20000");
    expect(e.kind).toBe("income");
    expect(e.category).toBeNull();
  });

  it("возврат не считается доходом", () => {
    expect(p("Возврат за куртку 3000").kind).toBe("refund");
  });

  it("категория по началу слова, а не по случайному совпадению", () => {
    expect(p("Кроссовки 4500").category).toBe("shopping");
    expect(p("Обед в кафе 450").category).toBe("food");
    expect(p("Наушники 2500").category).toBe("tech");
  });

  it("непонятная покупка не получает категорию молча", () => {
    const e = p("Штука 700");
    expect(e.kind).toBe("expense");
    expect(e.category).toBeNull();
  });

  it("описание сохраняется целиком", () => {
    expect(p("кофе 180 с коллегой").description).toBe("кофе с коллегой");
  });
});

describe("многострочный ввод", () => {
  it("разбирает список построчно", () => {
    const r = parseEntries("Такси 250\nКофе 180\nФутболка 1500\nЗарплата 20000");
    expect(r.entries).toHaveLength(4);
    expect(r.entries.map((e) => e.kind)).toEqual(["expense", "expense", "expense", "income"]);
    expect(r.entries.map((e) => e.category)).toEqual(["transport", "food", "shopping", null]);
    expect(r.unparsed).toEqual([]);
  });

  it("строки без суммы попадают в unparsed", () => {
    const r = parseEntries("Такси 250\nчто-то забыл\n");
    expect(r.entries).toHaveLength(1);
    expect(r.unparsed).toEqual(["что-то забыл"]);
  });

  it("пустые строки игнорируются", () => {
    expect(parseEntries("\n\nКофе 100\n\n").entries).toHaveLength(1);
  });
});

// Ложные срабатывания, найденные на реальных записях пользователя.
describe("неоднозначные слова не ловятся по началу", () => {
  const cat = (s: string) => parseLine(s)!.category;

  it("«клубника» — еда, а не ночной клуб", () => {
    expect(cat("клубника в шоколаде 1000")).toBe("food");
  });

  it("«клуб» отдельным словом всё ещё развлечения", () => {
    expect(cat("клуб 2000")).toBe("fun");
  });

  it("«барбекю» — еда, а не бар", () => {
    expect(cat("барбекю 1500")).toBe("food");
  });

  it("«газета» не попадает в «Дом» из-за «газ»", () => {
    expect(cat("газета 50")).not.toBe("home");
  });

  it("«газ» отдельным словом — дом", () => {
    expect(cat("газ 800")).toBe("home");
  });

  it("«светильник» — дом", () => {
    expect(cat("светильник 1200")).toBe("home");
  });

  it("реальные записи классифицируются верно", () => {
    expect(cat("проезд 34")).toBe("transport");
    expect(parseLine("зарплата 40000")!.kind).toBe("income");
  });
});
