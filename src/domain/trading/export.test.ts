import { describe, expect, it } from "vitest";
import { backup, BACKUP_SCHEMA_VERSION, csvCell, exportFileName, toCsv } from "./export";

describe("защита от подстановки формул", () => {
  it("значение, начинающееся с «=», не выполняется таблицей", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
  });

  it("плюс, минус и собачка тоже обезвреживаются", () => {
    expect(csvCell("+42")).toBe("'+42");
    expect(csvCell("-подробности")).toBe("'-подробности");
    expect(csvCell("@user")).toBe("'@user");
  });

  it("обычный текст не портится", () => {
    expect(csvCell("Такси до офиса")).toBe("Такси до офиса");
    expect(csvCell("4650.25")).toBe("4650.25");
  });
});

describe("экранирование", () => {
  it("кавычки удваиваются", () => {
    expect(csvCell('он сказал "да"')).toBe('"он сказал ""да"""');
  });

  it("перенос строки не разрывает запись", () => {
    expect(csvCell("первая\nвторая")).toBe('"первая\nвторая"');
  });

  it("точка с запятой внутри текста берётся в кавычки", () => {
    expect(csvCell("вход; стоп")).toBe('"вход; стоп"');
  });

  it("пустое остаётся пустым, а не нулём", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe("");
  });
});

describe("файл целиком", () => {
  const rows = [
    { code: "XAUUSD", note: "хороший вход", r: "2.78" },
    { code: "AAPL", note: null, r: null },
  ];
  const csv = toCsv(rows, [
    { header: "Инструмент", value: (r) => r.code },
    { header: "Заметка", value: (r) => r.note },
    { header: "R", value: (r) => r.r },
  ]);

  it("начинается с BOM — иначе Excel ломает кириллицу", () => {
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("разделитель — точка с запятой", () => {
    expect(csv).toContain("Инструмент;Заметка;R");
  });

  it("неизвестные значения оставлены пустыми", () => {
    expect(csv).toContain("AAPL;;");
  });

  it("строки разделены CRLF", () => {
    expect(csv.split("\r\n").length).toBeGreaterThan(2);
  });

  it("кириллица сохраняется как есть", () => {
    expect(csv).toContain("хороший вход");
  });
});

describe("резервная выгрузка", () => {
  it("несёт версию схемы и время", () => {
    const envelope = backup(
      { id: "a1", title: "Основной", currency: "USD", timezone: "Asia/Bishkek" },
      { trades: [] },
    );
    expect(envelope.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(envelope.account.title).toBe("Основной");
    expect(new Date(envelope.exportedAt).getTime()).not.toBeNaN();
  });

  it("имя файла содержит дату", () => {
    expect(exportFileName("trades", "csv")).toMatch(/^trades-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
