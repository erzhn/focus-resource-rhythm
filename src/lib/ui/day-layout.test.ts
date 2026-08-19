import { describe, expect, it } from "vitest";
import { layoutDay } from "./day-layout";

const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m, 0);
const ev = (id: string, sh: number, sm: number, eh: number, em: number) => ({
  id,
  start: at(sh, sm),
  end: at(eh, em),
});

describe("layoutDay", () => {
  it("непересекающиеся события — одна дорожка", () => {
    const blocks = layoutDay([ev("a", 9, 0, 10, 0), ev("b", 11, 0, 12, 0)]);
    expect(blocks.every((b) => b.lanes === 1 && b.lane === 0)).toBe(true);
  });

  it("два пересекающихся события делят две дорожки", () => {
    const blocks = layoutDay([ev("a", 9, 0, 10, 30), ev("b", 10, 0, 11, 0)]);
    expect(blocks.map((b) => b.lanes)).toEqual([2, 2]);
    expect(blocks.map((b) => b.lane).sort()).toEqual([0, 1]);
  });

  it("считает минуты старта и длительность", () => {
    const [b] = layoutDay([ev("a", 9, 30, 10, 0)]);
    expect(b.startMinute).toBe(9 * 60 + 30);
    expect(b.durationMinute).toBe(30);
  });

  it("минимальная высота блока 15 минут", () => {
    const [b] = layoutDay([ev("a", 9, 0, 9, 5)]);
    expect(b.durationMinute).toBe(15);
  });

  it("освободившаяся дорожка переиспользуется следующим кластером", () => {
    // a,b пересекаются (2 дорожки); c начинается позже — отдельный кластер, 1 дорожка.
    const blocks = layoutDay([ev("a", 9, 0, 10, 0), ev("b", 9, 30, 10, 0), ev("c", 11, 0, 12, 0)]);
    const c = blocks.find((x) => x.item.id === "c")!;
    expect(c.lanes).toBe(1);
    expect(c.lane).toBe(0);
  });
});
