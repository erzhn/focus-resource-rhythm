import { describe, expect, it } from "vitest";
import { dec, round, toTrimmedString } from "./decimal";
import {
  closedStats,
  compareToPrevious,
  drawdown,
  equityCurve,
  groupStats,
  observations,
  rDistribution,
  realizedInPeriod,
  SMALL_SAMPLE,
  type AnalyticsTrade,
  type Posting,
} from "./analytics";
import type { Decimal } from "./decimal";
import type { Maybe } from "./types";

function val(m: Maybe<Decimal>, scale = 4): string {
  if (!m.known) throw new Error(`Ожидалось известное значение, получено: ${m.reason}`);
  return toTrimmedString(round(m.value, scale));
}

let seq = 0;
const trade = (over: Partial<AnalyticsTrade> = {}): AnalyticsTrade => ({
  id: `t${++seq}`,
  instrumentCode: "XAUUSD",
  marketCode: "metals",
  direction: "long",
  openedAt: new Date("2026-10-01T09:00:00Z"),
  closedAt: new Date("2026-10-01T12:00:00Z"),
  localDate: "2026-10-01",
  status: "closed",
  netAccount: dec("50"),
  finalR: dec("2"),
  setupId: "setup-1",
  emotionBefore: null,
  ...over,
});

describe("статистика закрытых сделок", () => {
  const trades = [
    trade({ netAccount: dec("50"), finalR: dec("2") }),
    trade({ netAccount: dec("30"), finalR: dec("1.5") }),
    trade({ netAccount: dec("-20"), finalR: dec("-1") }),
    trade({ netAccount: dec("0"), finalR: dec("0") }),
    trade({ status: "open", netAccount: null, finalR: null }),
  ];
  const stats = closedStats(trades);

  it("открытые сделки в статистику закрытых не попадают", () => {
    expect(stats.count).toBe(4);
  });

  it("безубыточные считаются отдельно, а не записываются в выигрыши", () => {
    expect(stats).toMatchObject({ wins: 2, losses: 1, breakeven: 1 });
  });

  it("доля выигрышей — от всех закрытых с известным результатом", () => {
    expect(val(stats.winRate, 2)).toBe("50");
  });

  it("профит-фактор = 80 / 20", () => {
    expect(val(stats.profitFactor)).toBe("4");
  });

  it("чистый результат +60", () => {
    expect(toTrimmedString(stats.netPnl)).toBe("60");
  });

  it("средний и суммарный R", () => {
    expect(val(stats.avgR)).toBe("0.625");
    expect(val(stats.sumR)).toBe("2.5");
  });
});

describe("неизвестные значения не исчезают из статистики", () => {
  const trades = [
    trade({ netAccount: dec("50"), finalR: dec("2") }),
    trade({ netAccount: dec("40"), finalR: null }), // стопа не было
    trade({ netAccount: null, finalR: null }), // курс неизвестен
  ];
  const stats = closedStats(trades);

  it("сделки без R считаются отдельно", () => {
    expect(stats).toMatchObject({ knownR: 1, unknownR: 2 });
  });

  it("сделки без денежного итога тоже", () => {
    expect(stats.unknownNet).toBe(1);
  });

  it("средний R считается только по известным и не размывается нулями", () => {
    expect(val(stats.avgR)).toBe("2");
  });

  it("доля выигрышей не учитывает сделки с неизвестным итогом", () => {
    // Два известных результата, оба положительные.
    expect(val(stats.winRate, 2)).toBe("100");
  });
});

describe("пустая выборка не даёт выдуманных чисел", () => {
  const stats = closedStats([]);

  it("доля выигрышей неизвестна, а не ноль и не сто", () => {
    expect(stats.winRate.known).toBe(false);
  });

  it("средний R неизвестен, а не ноль", () => {
    expect(stats.avgR.known).toBe(false);
  });

  it("профит-фактор неизвестен", () => {
    expect(stats.profitFactor.known).toBe(false);
  });

  it("ни NaN, ни Infinity", () => {
    expect(toTrimmedString(stats.netPnl)).toBe("0");
    expect(stats.count).toBe(0);
  });
});

describe("профит-фактор без убытков", () => {
  it("объясняется состоянием, а не числом", () => {
    const stats = closedStats([trade({ netAccount: dec("50") })]);
    expect(stats.profitFactor.known).toBe(false);
    if (!stats.profitFactor.known) {
      expect(stats.profitFactor.reason).toContain("делить не на что");
    }
  });
});

describe("25. P/L за период и статистика закрытых — разные выборки", () => {
  // Частичный выход в октябре, финальный — в ноябре.
  const postings: Posting[] = [
    { at: new Date("2026-10-20T10:00:00Z"), amount: dec("30"), tradeId: "t-split" },
    { at: new Date("2026-11-03T10:00:00Z"), amount: dec("-10"), tradeId: "t-split" },
  ];

  const october = realizedInPeriod(
    postings,
    new Date("2026-10-01T00:00:00Z"),
    new Date("2026-10-31T23:59:59Z"),
  );
  const november = realizedInPeriod(
    postings,
    new Date("2026-11-01T00:00:00Z"),
    new Date("2026-11-30T23:59:59Z"),
  );

  it("денежный результат распределён по проводкам", () => {
    expect(toTrimmedString(october)).toBe("30");
    expect(toTrimmedString(november)).toBe("-10");
  });

  it("статистика закрытых относит сделку целиком к месяцу закрытия", () => {
    const closedInNovember = closedStats([
      trade({
        closedAt: new Date("2026-11-03T10:00:00Z"),
        netAccount: dec("20"),
        finalR: dec("0.5"),
      }),
    ]);
    expect(toTrimmedString(closedInNovember.netPnl)).toBe("20");
  });

  it("суммы по двум основаниям не обязаны совпадать — это не ошибка", () => {
    expect(toTrimmedString(october)).not.toBe("20");
  });
});

describe("кривая результата и просадка", () => {
  const postings: Posting[] = [
    { at: new Date("2026-10-01"), amount: dec("100"), tradeId: "a" },
    { at: new Date("2026-10-02"), amount: dec("-40"), tradeId: "b" },
    { at: new Date("2026-10-03"), amount: dec("-30"), tradeId: "c" },
    { at: new Date("2026-10-04"), amount: dec("50"), tradeId: "d" },
  ];
  const curve = equityCurve(postings);

  it("кривая накапливает результат по порядку времени", () => {
    expect(curve.map((p) => toTrimmedString(p.cumulative))).toEqual(["100", "60", "30", "80"]);
  });

  it("просадка считается от исторического максимума", () => {
    const d = drawdown(curve);
    expect(toTrimmedString(d.peak)).toBe("100");
    expect(toTrimmedString(d.max)).toBe("70");
    expect(toTrimmedString(d.current)).toBe("20");
  });

  it("пустая кривая не ломает расчёт", () => {
    const d = drawdown([]);
    expect(toTrimmedString(d.max)).toBe("0");
  });
});

describe("разрезы по признакам", () => {
  const trades = [
    trade({ instrumentCode: "XAUUSD", netAccount: dec("50"), finalR: dec("2") }),
    trade({ instrumentCode: "XAUUSD", netAccount: dec("-20"), finalR: dec("-1") }),
    trade({ instrumentCode: "AAPL", marketCode: "equity", netAccount: dec("10"), finalR: dec("1") }),
  ];
  const groups = groupStats(trades, (t) => ({ key: t.instrumentCode, label: t.instrumentCode }));

  it("группы отсортированы по результату", () => {
    expect(groups.map((g) => g.key)).toEqual(["XAUUSD", "AAPL"]);
    expect(toTrimmedString(groups[0].netPnl)).toBe("30");
  });

  it("малая выборка помечается, но группа не скрывается", () => {
    expect(groups.every((g) => g.smallSample)).toBe(true);
    expect(SMALL_SAMPLE).toBeGreaterThan(1);
  });

  it("лоты разных рынков не складываются — сравнивается только результат в валюте счёта", () => {
    // В разрезе нет ни одного поля с объёмом: сложить 0.01 лота золота и
    // 2 акции было бы бессмысленно.
    expect(Object.keys(groups[0])).not.toContain("quantity");
  });
});

describe("распределение R", () => {
  const trades = [
    trade({ finalR: dec("2.5") }),
    trade({ finalR: dec("-1") }),
    trade({ finalR: dec("0.5") }),
    trade({ finalR: null }),
  ];
  const { buckets, unknown } = rDistribution(trades);

  it("раскладывает известные R по столбцам", () => {
    expect(buckets.find((b) => b.label === "2…3R")?.count).toBe(1);
    expect(buckets.find((b) => b.label === "−1…0R")?.count).toBe(1);
    expect(buckets.find((b) => b.label === "0…1R")?.count).toBe(1);
  });

  it("неизвестные R считаются отдельно, а не попадают в нулевой столбец", () => {
    expect(unknown).toBe(1);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe("наблюдения", () => {
  it("описывают факты и не приписывают причину", () => {
    const list = observations([
      trade({ finalR: null }),
      trade({ finalR: null }),
      trade({ netAccount: null, finalR: null }),
    ]);
    const unknownR = list.find((o) => o.code === "unknown_r");
    expect(unknownR?.count).toBe(3);
    // Ни одна формулировка не утверждает, что нарушение чего-то стоило.
    for (const o of list) {
      expect(o.title + o.basis).not.toMatch(/стоил|из-за|потер/i);
    }
  });

  it("дают ссылку на сделки, из которых посчитаны", () => {
    const list = observations([trade({ finalR: null })]);
    expect(list[0].tradeIds).toHaveLength(1);
  });

  it("на пустых данных ничего не выдумывают", () => {
    expect(observations([])).toEqual([]);
  });
});

describe("сравнение периодов", () => {
  it("считает процент изменения", () => {
    expect(val(compareToPrevious(dec("150"), dec("100")), 2)).toBe("50");
  });

  it("при отрицательной базе берёт её модуль", () => {
    expect(val(compareToPrevious(dec("-50"), dec("-100")), 2)).toBe("50");
  });

  it("при нулевой базе процент не выдумывает", () => {
    const result = compareToPrevious(dec("50"), dec("0"));
    expect(result.known).toBe(false);
    if (!result.known) expect(result.reason).toContain("нулю");
  });
});
