import { describe, expect, it } from "vitest";
import { dec, toTrimmedString, round } from "./decimal";
import { dayRange, formatLocalDate, isValidTimeZone, localDate, localTime, monthOf, shiftDate } from "./day";
import type { Decimal } from "./decimal";
import type { Maybe } from "./types";
import {
  comparableWithOutcome,
  disciplineScore,
  entryLimitCheck,
  pauseActive,
  previousClosedTrade,
  type RuleEvaluation,
  type SequenceTrade,
} from "./discipline";

const BISHKEK = "Asia/Bishkek";

/** Известное значение с округлением; иначе тест падает с причиной. */
function val(m: Maybe<Decimal>, scale = 2): string {
  if (!m.known) throw new Error(`Ожидалось известное значение, получено: ${m.reason}`);
  return toTrimmedString(round(m.value, scale));
}

const rule = (over: Partial<RuleEvaluation> = {}): RuleEvaluation => ({
  ruleCode: "risk_per_trade",
  ruleVersion: 1,
  stage: "pre_entry",
  status: "passed",
  weight: dec("1"),
  reconstructed: false,
  ...over,
});

describe("19. Локальная дата по сохранённой зоне", () => {
  const instant = new Date("2026-09-28T18:30:00Z");

  it("2026-09-28 18:30 UTC в Бишкеке — это 29 сентября, 00:30", () => {
    expect(localDate(instant, BISHKEK)).toBe("2026-09-29");
    expect(localTime(instant, BISHKEK)).toBe("00:30");
  });

  it("границы суток считаются в абсолютном времени", () => {
    const { start, end } = dayRange("2026-09-29", BISHKEK);
    expect(start.toISOString()).toBe("2026-09-28T18:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-29T18:00:00.000Z");
    expect(instant.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(instant.getTime()).toBeLessThan(end.getTime());
  });

  it("зона с переходом на летнее время обрабатывается настоящими правилами", () => {
    // Берлин: 2026-03-29 переход на летнее время, сутки короче на час.
    const spring = dayRange("2026-03-29", "Europe/Berlin");
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 3_600_000);

    const autumn = dayRange("2026-10-25", "Europe/Berlin");
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * 3_600_000);
  });

  it("служебные функции дат", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(monthOf("2026-09-29")).toBe("2026-09");
    expect(formatLocalDate("2026-09-29")).toBe("29 сентября");
    expect(isValidTimeZone(BISHKEK)).toBe(true);
    expect(isValidTimeZone("Нигде/Никогда")).toBe(false);
  });
});

describe("21. Лимит входов за день", () => {
  const limit = 3;
  // Четыре входа 29 сентября по бишкекскому времени.
  const moments = [
    new Date("2026-09-28T18:30:00Z"), // 00:30 местного
    new Date("2026-09-29T04:00:00Z"), // 10:00
    new Date("2026-09-29T06:00:00Z"), // 12:00
    new Date("2026-09-29T08:00:00Z"), // 14:00
  ];
  const result = entryLimitCheck(moments, limit, BISHKEK);

  it("все четыре отнесены к одному локальному дню", () => {
    expect(result.map((r) => r.date)).toEqual(Array(4).fill("2026-09-29"));
  });

  it("нарушение только у четвёртого", () => {
    expect(result.map((r) => r.violates)).toEqual([false, false, false, true]);
  });

  it("первые три не переписаны задним числом", () => {
    expect(result.slice(0, 3).map((r) => r.ordinal)).toEqual([1, 2, 3]);
  });

  it("порядок результата соответствует порядку входных данных, а не времени", () => {
    const shuffled = [moments[3], moments[0], moments[2], moments[1]];
    const r = entryLimitCheck(shuffled, limit, BISHKEK);
    expect(r[0].violates).toBe(true);
    expect(r[1].ordinal).toBe(1);
  });
});

describe("20. Предыдущая закрытая сделка", () => {
  const entryMoment = new Date("2026-10-01T12:00:00Z");

  const openedEarlierStillOpen: SequenceTrade = {
    id: "long-runner",
    accountId: "acc",
    openedAt: new Date("2026-10-01T08:00:00Z"),
    closedAt: new Date("2026-10-01T18:00:00Z"), // закрылась ПОСЛЕ текущего входа
    netAccount: dec("-100"),
  };
  const closedBefore: SequenceTrade = {
    id: "earlier",
    accountId: "acc",
    openedAt: new Date("2026-10-01T06:00:00Z"),
    closedAt: new Date("2026-10-01T09:00:00Z"),
    netAccount: dec("20"),
  };

  it("позиция, открытая раньше, но закрытая позже, не используется", () => {
    const prev = previousClosedTrade([openedEarlierStillOpen, closedBefore], "acc", entryMoment);
    expect(prev?.id).toBe("earlier");
  });

  it("чужой счёт не учитывается", () => {
    const other = { ...closedBefore, id: "other", accountId: "acc-2" };
    expect(previousClosedTrade([other], "acc", entryMoment)).toBeNull();
  });

  it("пауза не включается по будущему результату чужой открытой позиции", () => {
    const prev = previousClosedTrade([openedEarlierStillOpen, closedBefore], "acc", entryMoment);
    const pause = pauseActive(prev, entryMoment, 60);
    expect(pause).toEqual({ known: true, value: false });
  });

  it("после убытка пауза активна до истечения срока", () => {
    const loss: SequenceTrade = {
      ...closedBefore,
      netAccount: dec("-15"),
      closedAt: new Date("2026-10-01T11:30:00Z"),
    };
    expect(pauseActive(loss, entryMoment, 60)).toEqual({ known: true, value: true });
    expect(pauseActive(loss, new Date("2026-10-01T12:31:00Z"), 60)).toEqual({
      known: true,
      value: false,
    });
  });

  it("неизвестный результат предыдущей сделки не выдаётся за отсутствие паузы", () => {
    const vague: SequenceTrade = { ...closedBefore, netAccount: null };
    const pause = pauseActive(vague, entryMoment, 60);
    expect(pause.known).toBe(false);
  });
});

describe("22. Неизвестное не становится выполненным", () => {
  const evaluations = [
    rule({ status: "passed" }),
    rule({ ruleCode: "news_window", status: "unknown", unknownReason: "Календарь не заполнен." }),
    rule({ ruleCode: "mfe_known", status: "unknown", unknownReason: "MFE не записан." }),
  ];
  const result = disciplineScore(evaluations);

  it("unknown не попадает в числитель и знаменатель оценки", () => {
    expect(val(result.score)).toBe("100");
    expect(result.unknown).toBe(2);
  });

  it("полнота честно показывает, что проверена треть", () => {
    expect(val(result.coverage)).toBe("33.33");
  });

  it("ложного passed нет", () => {
    expect(evaluations.filter((e) => e.status === "passed")).toHaveLength(1);
  });
});

describe("24. Нет данных — нет ложной дисциплины", () => {
  it("все правила unknown или not_applicable", () => {
    const result = disciplineScore([
      rule({ status: "unknown" }),
      rule({ ruleCode: "x", status: "not_applicable" }),
    ]);
    expect(result.score.known).toBe(false);
    if (!result.score.known) expect(result.score.reason).toContain("Недостаточно данных");
  });

  it("сделок нет вовсе", () => {
    const result = disciplineScore([]);
    expect(result.score.known).toBe(false);
    expect(result.coverage.known).toBe(false);
  });

  it("ни NaN, ни Infinity, ни деления на ноль", () => {
    const result = disciplineScore([rule({ status: "not_applicable" })]);
    expect(result.score.known).toBe(false);
    expect(result.coverage.known).toBe(false);
    expect(() => disciplineScore([])).not.toThrow();
  });
});

describe("оценка и полнота на смешанных данных", () => {
  const evaluations = [
    rule({ ruleCode: "a", status: "passed", weight: dec("2") }),
    rule({ ruleCode: "b", status: "passed", weight: dec("2") }),
    rule({ ruleCode: "c", status: "failed", weight: dec("1") }),
    rule({ ruleCode: "d", status: "unknown", weight: dec("1") }),
    rule({ ruleCode: "e", status: "not_applicable", weight: dec("5") }),
  ];
  const result = disciplineScore(evaluations);

  it("score считается по весам выполненных и нарушенных", () => {
    expect(val(result.score)).toBe("80");
  });

  it("coverage считается без not_applicable", () => {
    expect(val(result.coverage)).toBe("83.33");
  });

  it("счётчики возвращаются рядом с оценкой", () => {
    expect(result).toMatchObject({ passed: 2, failed: 1, unknown: 1, notApplicable: 1 });
  });
});

describe("сравнение дисциплины с результатом", () => {
  it("берутся только проверки до входа и не восстановленные", () => {
    const evaluations = [
      rule({ ruleCode: "a", stage: "pre_entry", reconstructed: false }),
      rule({ ruleCode: "b", stage: "pre_entry", reconstructed: true }),
      rule({ ruleCode: "c", stage: "in_trade", reconstructed: false }),
      rule({ ruleCode: "d", stage: "post_trade", reconstructed: false }),
    ];
    expect(comparableWithOutcome(evaluations).map((e) => e.ruleCode)).toEqual(["a"]);
  });
});
