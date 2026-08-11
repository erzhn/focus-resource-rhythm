import { describe, expect, it } from "vitest";
import { activeWithoutNextAction, canAddToNow, countActive, type FocusResult } from "./index";

const r = (id: string, zone: FocusResult["zone"], hasNextAction = true): FocusResult => ({
  id,
  title: `Результат ${id}`,
  zone,
  hasNextAction,
});

describe("зоны фокуса и лимит трёх активных результатов", () => {
  it("разрешает добавление, пока активных меньше трёх", () => {
    const check = canAddToNow([r("1", "now"), r("2", "now")]);
    expect(check.allowed).toBe(true);
    expect(check.activeCount).toBe(2);
    expect(check.limit).toBe(3);
  });

  it("запрещает четвёртый активный результат и предлагает варианты", () => {
    const check = canAddToNow([r("1", "now"), r("2", "now"), r("3", "now")]);
    expect(check.allowed).toBe(false);
    expect(check.options.length).toBeGreaterThan(0);
    const kinds = new Set(check.options.map((o) => o.kind));
    expect(kinds).toEqual(new Set(["complete", "pause", "move_next", "cancel"]));
  });

  it("не учитывает результаты из других зон в лимите", () => {
    const results = [r("1", "now"), r("2", "next"), r("3", "later"), r("4", "declined")];
    expect(countActive(results)).toBe(1);
    expect(canAddToNow(results).allowed).toBe(true);
  });

  it("находит активные результаты без ближайшего действия", () => {
    const results = [r("1", "now", true), r("2", "now", false)];
    const missing = activeWithoutNextAction(results);
    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe("2");
  });
});
