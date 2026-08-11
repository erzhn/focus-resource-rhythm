import { describe, expect, it } from "vitest";
import { isDuplicateOperation, resolveSyncConflict } from "./conflict";
import { parseExternalDescription, taskToExternalEvent } from "./mapping";

const d = (s: string) => new Date(s);

describe("resolveSyncConflict", () => {
  it("внешнее удаление всегда требует подтверждения", () => {
    const r = resolveSyncConflict({
      changeType: "delete",
      localUpdatedAt: d("2026-08-01"),
      externalUpdatedAt: null,
      lastSyncedAt: d("2026-08-01"),
    });
    expect(r.decision).toBe("ask");
  });

  it("без внешних изменений сохраняем локальную версию", () => {
    const r = resolveSyncConflict({
      changeType: "update",
      localUpdatedAt: d("2026-08-05"),
      externalUpdatedAt: d("2026-08-01"),
      lastSyncedAt: d("2026-08-03"),
    });
    expect(r.decision).toBe("keep_local");
  });

  it("внешнее изменение не применяется молча — запрашивается подтверждение", () => {
    const r = resolveSyncConflict({
      changeType: "update",
      localUpdatedAt: d("2026-08-01"),
      externalUpdatedAt: d("2026-08-05"),
      lastSyncedAt: d("2026-08-03"),
    });
    expect(r.decision).toBe("ask");
  });

  it("изменение с обеих сторон помечается как конфликт", () => {
    const r = resolveSyncConflict({
      changeType: "update",
      localUpdatedAt: d("2026-08-06"),
      externalUpdatedAt: d("2026-08-05"),
      lastSyncedAt: d("2026-08-03"),
    });
    expect(r.decision).toBe("ask");
    expect(r.reason).toContain("Конфликт");
  });

  it("невозможно определить более позднюю версию → показать обе", () => {
    const r = resolveSyncConflict({
      changeType: "update",
      localUpdatedAt: null,
      externalUpdatedAt: d("2026-08-05"),
      lastSyncedAt: null,
    });
    expect(r.decision).toBe("ask");
  });
});

describe("isDuplicateOperation (идемпотентность)", () => {
  it("одинаковый operation id считается дублем", () => {
    expect(isDuplicateOperation("op-1", "op-1")).toBe(true);
  });
  it("разные id — не дубль", () => {
    expect(isDuplicateOperation("op-2", "op-1")).toBe(false);
    expect(isDuplicateOperation(null, "op-1")).toBe(false);
  });
});

describe("отображение задача ↔ внешнее событие", () => {
  it("проект и приоритет попадают в структурированный блок описания", () => {
    const ev = taskToExternalEvent({
      title: "Согласовать спецификацию",
      start: d("2026-08-05T09:00"),
      end: d("2026-08-05T10:00"),
      description: "заметка пользователя",
      projectTitle: "Запуск",
      priority: 84,
    });
    expect(ev.summary).toBe("Согласовать спецификацию");
    expect(ev.description).toContain("Проект: Запуск");
    expect(ev.description).toContain("Приоритет: 84");
    expect(ev.description).toContain("заметка пользователя");
  });

  it("парсинг возвращает проект, приоритет и очищенное описание пользователя", () => {
    const ev = taskToExternalEvent({
      title: "T",
      start: d("2026-08-05T09:00"),
      end: d("2026-08-05T10:00"),
      description: "моя заметка",
      projectTitle: "Проект X",
      priority: 50,
    });
    const parsed = parseExternalDescription(ev.description);
    expect(parsed.projectTitle).toBe("Проект X");
    expect(parsed.priority).toBe(50);
    expect(parsed.userDescription).toBe("моя заметка");
  });

  it("описание без блока парсится без ошибок", () => {
    const parsed = parseExternalDescription("просто текст");
    expect(parsed.projectTitle).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.userDescription).toBe("просто текст");
  });
});
