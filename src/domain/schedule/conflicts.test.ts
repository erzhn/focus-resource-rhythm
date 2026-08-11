import { describe, expect, it } from "vitest";
import { findConflicts, overlaps, type TimeBlock } from "./conflicts";

const block = (id: string, start: string, end: string, fixed = false): TimeBlock => ({
  id,
  title: id,
  start: new Date(start),
  end: new Date(end),
  fixed,
});

describe("конфликты временных блоков", () => {
  it("определяет пересечение двух блоков", () => {
    const a = block("a", "2026-08-05T09:00", "2026-08-05T10:00");
    const b = block("b", "2026-08-05T09:30", "2026-08-05T10:30");
    expect(overlaps(a, b)).toBe(true);
  });

  it("смежные блоки (конец = начало) не считаются конфликтом", () => {
    const a = block("a", "2026-08-05T09:00", "2026-08-05T10:00");
    const b = block("b", "2026-08-05T10:00", "2026-08-05T11:00");
    expect(overlaps(a, b)).toBe(false);
    expect(findConflicts([a, b])).toHaveLength(0);
  });

  it("находит все конфликтующие пары и считает минуты пересечения", () => {
    const blocks = [
      block("a", "2026-08-05T09:00", "2026-08-05T10:00"),
      block("b", "2026-08-05T09:30", "2026-08-05T10:30"),
      block("c", "2026-08-05T12:00", "2026-08-05T13:00"),
    ];
    const conflicts = findConflicts(blocks);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapMinutes).toBe(30);
  });
});
