import { describe, expect, it } from "vitest";
import { dec } from "./decimal";
import { blockingViolations, evaluatePreEntryRules, lossStreakOf, RULE_DEFINITIONS, type RuleCode, type RuleConfig, type RuleContext } from "./rules";
import { disciplineScore, type SequenceTrade } from "./discipline";
import { known, unknown } from "./types";
import type { InitialRisk } from "./trade-math";

/**
 * Проверки перед входом.
 *
 * Основное, что здесь проверяется, — не арифметика, а честность: включённое
 * правило без порога не считается выполненным, нехватка данных не выдаётся за
 * отсутствие нарушения, а результат сделки в проверки не попадает.
 */

const risk = (over: Partial<InitialRisk> = {}): InitialRisk => ({
  distance: known(dec("18")),
  riskQuote: known(dec("18")),
  riskAccount: known(dec("18")),
  riskPct: known(dec("25.714286")),
  ...over,
});

const config = (code: RuleCode, over: Partial<RuleConfig> = {}): RuleConfig => ({
  code,
  enabled: true,
  mode: "warn",
  weight: dec("1"),
  params: {},
  version: 1,
  ...over,
});

const context = (over: Partial<RuleContext> = {}): RuleContext => ({
  risk: risk(),
  hasStop: true,
  setupId: "setup-1",
  balanceAtEntry: dec("1000"),
  openRiskAccount: known(dec("0")),
  realizedToday: known(dec("0")),
  balanceAtDayStart: dec("1000"),
  entriesToday: 0,
  previousClosed: null,
  lossStreak: 0,
  newsWindow: "outside",
  entryMoment: new Date("2026-10-13T10:00:00Z"),
  ...over,
});

const statusOf = (code: RuleCode, configs: RuleConfig[], ctx: RuleContext) =>
  evaluatePreEntryRules(configs, ctx).find((e) => e.ruleCode === code)?.status;

describe("пороги задаёт пользователь", () => {
  it("включённое правило без порога даёт unknown, а не passed", () => {
    const evaluations = evaluatePreEntryRules([config("risk_per_trade")], context());
    expect(evaluations[0].status).toBe("unknown");
    expect(evaluations[0].unknownReason).toContain("Порог не задан");
  });

  it("ни у одного встроенного правила нет порога по умолчанию", () => {
    // Подставленный процент выглядел бы рекомендацией, которой здесь не от кого.
    for (const definition of RULE_DEFINITIONS) {
      expect(definition).not.toHaveProperty("defaultValue");
    }
  });

  it("выключенные правила не оцениваются вовсе", () => {
    const evaluations = evaluatePreEntryRules(
      [config("stop_required", { enabled: false })],
      context(),
    );
    expect(evaluations).toEqual([]);
  });
});

describe("риск на сделку", () => {
  const configs = [config("risk_per_trade", { params: { maxPct: "2" } })];

  it("риск в пределах лимита проходит", () => {
    // 18 из 1000 — это 1.8 %.
    expect(statusOf("risk_per_trade", configs, context())).toBe("passed");
  });

  it("превышение лимита — нарушение", () => {
    expect(statusOf("risk_per_trade", configs, context({ balanceAtEntry: dec("500") }))).toBe("failed");
  });

  it("неизвестный баланс даёт unknown, а не passed", () => {
    expect(statusOf("risk_per_trade", configs, context({ balanceAtEntry: null }))).toBe("unknown");
  });

  it("неизвестный риск даёт unknown с причиной из расчёта", () => {
    const evaluations = evaluatePreEntryRules(
      configs,
      context({ risk: risk({ riskAccount: unknown("Стоп не задан — исходный риск неизвестен.") }) }),
    );
    expect(evaluations[0].status).toBe("unknown");
    expect(evaluations[0].unknownReason).toContain("Стоп не задан");
  });
});

describe("суммарный открытый риск", () => {
  const configs = [config("open_risk_total", { params: { maxPct: "5" } })];

  it("складывает риск новой позиции с уже открытыми", () => {
    // 18 + 40 = 58 из 1000 = 5.8 % — больше пяти.
    expect(
      statusOf("open_risk_total", configs, context({ openRiskAccount: known(dec("40")) })),
    ).toBe("failed");
    expect(
      statusOf("open_risk_total", configs, context({ openRiskAccount: known(dec("20")) })),
    ).toBe("passed");
  });

  it("неизвестный открытый риск не выдаётся за ноль", () => {
    expect(
      statusOf(
        "open_risk_total",
        configs,
        context({ openRiskAccount: unknown("У открытой позиции неизвестен курс.") }),
      ),
    ).toBe("unknown");
  });
});

describe("дневной лимит убытка", () => {
  const configs = [config("daily_loss_limit", { params: { maxPct: "3" } })];

  it("прибыльный день лимит убытка не нарушает", () => {
    expect(statusOf("daily_loss_limit", configs, context({ realizedToday: known(dec("50")) }))).toBe(
      "passed",
    );
  });

  it("убыток меньше лимита проходит", () => {
    expect(statusOf("daily_loss_limit", configs, context({ realizedToday: known(dec("-20")) }))).toBe(
      "passed",
    );
  });

  it("убыток больше лимита — нарушение", () => {
    expect(statusOf("daily_loss_limit", configs, context({ realizedToday: known(dec("-35")) }))).toBe(
      "failed",
    );
  });

  it("считается от баланса НА НАЧАЛО дня, а не от текущего", () => {
    const ctx = context({ realizedToday: known(dec("-35")), balanceAtDayStart: dec("2000") });
    expect(statusOf("daily_loss_limit", configs, ctx)).toBe("passed");
  });
});

describe("21. лимит входов за день", () => {
  const configs = [config("max_entries_per_day", { params: { max: "3" } })];

  it("первые три входа проходят", () => {
    expect(statusOf("max_entries_per_day", configs, context({ entriesToday: 0 }))).toBe("passed");
    expect(statusOf("max_entries_per_day", configs, context({ entriesToday: 2 }))).toBe("passed");
  });

  it("четвёртый нарушает", () => {
    expect(statusOf("max_entries_per_day", configs, context({ entriesToday: 3 }))).toBe("failed");
  });
});

describe("20. паузы", () => {
  const closedAt = new Date("2026-10-13T09:30:00Z");
  const loss: SequenceTrade = {
    id: "prev",
    accountId: "acc",
    openedAt: new Date("2026-10-13T09:00:00Z"),
    closedAt,
    netAccount: dec("-20"),
  };
  const configs = [config("pause_after_loss", { params: { minutes: "60" } })];

  it("вход до истечения паузы — нарушение", () => {
    const ctx = context({ previousClosed: loss, entryMoment: new Date("2026-10-13T10:00:00Z") });
    expect(statusOf("pause_after_loss", configs, ctx)).toBe("failed");
  });

  it("после паузы вход проходит", () => {
    const ctx = context({ previousClosed: loss, entryMoment: new Date("2026-10-13T10:31:00Z") });
    expect(statusOf("pause_after_loss", configs, ctx)).toBe("passed");
  });

  it("прибыльная предыдущая сделку паузу не включает", () => {
    const ctx = context({ previousClosed: { ...loss, netAccount: dec("30") } });
    expect(statusOf("pause_after_loss", configs, ctx)).toBe("passed");
  });

  it("неизвестный результат предыдущей сделки даёт unknown", () => {
    const ctx = context({ previousClosed: { ...loss, netAccount: null } });
    expect(statusOf("pause_after_loss", configs, ctx)).toBe("unknown");
  });

  it("серия убытков считается только по закрытым сделкам", () => {
    const trades: SequenceTrade[] = [
      { id: "a", accountId: "acc", openedAt: new Date("2026-10-13T06:00:00Z"), closedAt: new Date("2026-10-13T07:00:00Z"), netAccount: dec("-10") },
      { id: "b", accountId: "acc", openedAt: new Date("2026-10-13T07:30:00Z"), closedAt: new Date("2026-10-13T08:00:00Z"), netAccount: dec("-5") },
      { id: "c", accountId: "acc", openedAt: new Date("2026-10-13T08:30:00Z"), closedAt: null, netAccount: null },
    ];
    expect(lossStreakOf(trades)).toBe(2);
  });

  it("серия прерывается прибылью", () => {
    const trades: SequenceTrade[] = [
      { id: "a", accountId: "acc", openedAt: new Date("2026-10-13T06:00:00Z"), closedAt: new Date("2026-10-13T07:00:00Z"), netAccount: dec("-10") },
      { id: "b", accountId: "acc", openedAt: new Date("2026-10-13T07:30:00Z"), closedAt: new Date("2026-10-13T08:00:00Z"), netAccount: dec("20") },
    ];
    expect(lossStreakOf(trades)).toBe(0);
  });
});

describe("22. окно новостей", () => {
  const configs = [config("news_window", { params: { minutes: "30" } })];

  it("незаполненный календарь даёт unknown, а не «вне новостей»", () => {
    const evaluations = evaluatePreEntryRules(configs, context({ newsWindow: "unknown" }));
    expect(evaluations[0].status).toBe("unknown");
    expect(evaluations[0].unknownReason).toContain("не доказывает");
  });

  it("вход в окне события — нарушение", () => {
    expect(statusOf("news_window", configs, context({ newsWindow: "inside" }))).toBe("failed");
  });
});

describe("блокировка плана", () => {
  const configs = [
    config("stop_required", { mode: "block_plan" }),
    config("risk_per_trade", { mode: "warn", params: { maxPct: "1" } }),
    config("news_window", { mode: "block_plan", params: { minutes: "30" } }),
  ];

  it("блокирует только failed у правил в режиме блокировки", () => {
    const ctx = context({ hasStop: false, newsWindow: "unknown" });
    const evaluations = evaluatePreEntryRules(configs, ctx);
    const blocking = blockingViolations(evaluations, configs);
    expect(blocking.map((b) => b.ruleCode)).toEqual(["stop_required"]);
  });

  it("unknown не блокирует: нехватка данных не доказывает нарушение", () => {
    const ctx = context({ newsWindow: "unknown" });
    const blocking = blockingViolations(evaluatePreEntryRules(configs, ctx), configs);
    expect(blocking).toHaveLength(0);
  });

  it("нарушение в режиме предупреждения план не блокирует", () => {
    // Риск 1.8 % при пороге 1 % — нарушение, но режим warn.
    const blocking = blockingViolations(evaluatePreEntryRules(configs, context()), configs);
    expect(blocking).toHaveLength(0);
  });
});

describe("оценка дисциплины считается по этим же проверкам", () => {
  it("unknown не повышает оценку", () => {
    const configs = [
      config("stop_required"),
      config("risk_per_trade"), // без порога → unknown
      config("setup_required"),
    ];
    const evaluations = evaluatePreEntryRules(configs, context());
    const score = disciplineScore(evaluations);

    // Два выполненных из двух оценимых, третье неизвестно.
    expect(score.passed).toBe(2);
    expect(score.unknown).toBe(1);
    expect(score.coverage.known).toBe(true);
  });

  it("результат сделки в проверки не входит", () => {
    const evaluations = evaluatePreEntryRules([config("stop_required")], context());
    expect(evaluations.every((e) => e.stage === "pre_entry")).toBe(true);
    // В контексте нет ни одного поля с итогом текущей сделки.
    expect(Object.keys(context())).not.toContain("netAccount");
    expect(Object.keys(context())).not.toContain("finalR");
  });
});
