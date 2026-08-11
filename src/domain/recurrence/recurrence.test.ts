import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { expandOccurrences, nthWeekdayOfMonth, type RecurrenceRule } from "./index";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

describe("expandOccurrences", () => {
  it("ежедневно генерирует каждый день в окне", () => {
    const rule: RecurrenceRule = { frequency: "daily", startDate: new Date("2026-08-01") };
    const days = expandOccurrences(rule, new Date("2026-08-01"), new Date("2026-08-07"));
    expect(days).toHaveLength(7);
  });

  it("по выбранным дням недели (пн, ср, пт)", () => {
    // 1 = пн, 3 = ср, 5 = пт
    const rule: RecurrenceRule = {
      frequency: "weekly",
      startDate: new Date("2026-08-01"),
      weekdays: [1, 3, 5],
    };
    const days = expandOccurrences(rule, new Date("2026-08-03"), new Date("2026-08-09"));
    // Неделя 3–9 августа 2026: пн 3, ср 5, пт 7
    expect(days.map(iso)).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
  });

  it("произвольный интервал — каждые 3 дня", () => {
    const rule: RecurrenceRule = {
      frequency: "interval",
      startDate: new Date("2026-08-01"),
      intervalDays: 3,
    };
    const days = expandOccurrences(rule, new Date("2026-08-01"), new Date("2026-08-10"));
    expect(days.map(iso)).toEqual(["2026-08-01", "2026-08-04", "2026-08-07", "2026-08-10"]);
  });

  it("ежемесячно по дате — 15 число", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly_date",
      startDate: new Date("2026-08-01"),
      monthDay: 15,
    };
    const days = expandOccurrences(rule, new Date("2026-08-01"), new Date("2026-10-31"));
    expect(days.map(iso)).toEqual(["2026-08-15", "2026-09-15", "2026-10-15"]);
  });

  it("ежемесячно по правилу — последняя пятница", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly_rule",
      startDate: new Date("2026-08-01"),
      monthlyOrdinal: "last",
      monthlyWeekday: 5, // пятница
    };
    const days = expandOccurrences(rule, new Date("2026-08-01"), new Date("2026-09-30"));
    // Последняя пятница августа 2026 = 28-е, сентября = 25-е
    expect(days.map(iso)).toEqual(["2026-08-28", "2026-09-25"]);
  });

  it("исключение одного экземпляра не разрушает серию", () => {
    const rule: RecurrenceRule = { frequency: "daily", startDate: new Date("2026-08-01") };
    const days = expandOccurrences(
      rule,
      new Date("2026-08-01"),
      new Date("2026-08-05"),
      new Set(["2026-08-03"]),
    );
    expect(days.map(iso)).toEqual(["2026-08-01", "2026-08-02", "2026-08-04", "2026-08-05"]);
  });

  it("уважает дату окончания серии", () => {
    const rule: RecurrenceRule = {
      frequency: "daily",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-03"),
    };
    const days = expandOccurrences(rule, new Date("2026-08-01"), new Date("2026-08-31"));
    expect(days).toHaveLength(3);
  });
});

describe("nthWeekdayOfMonth", () => {
  it("вторая среда августа 2026 = 12-е", () => {
    const d = nthWeekdayOfMonth(2026, 7, 3, 2);
    expect(iso(d!)).toBe("2026-08-12");
  });

  it("пятой пятницы может не быть в месяце", () => {
    // Август 2026: пятницы 7,14,21,28 — пятой нет
    expect(nthWeekdayOfMonth(2026, 7, 5, 4)).not.toBeNull();
  });
});
