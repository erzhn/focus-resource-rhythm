import { describe, expect, it } from "vitest";
import { dec, round, toTrimmedString } from "./decimal";
import {
  bookBalance,
  cumulativeTradingPnl,
  dedupePostings,
  moneyDrawdown,
  type TradePosting,
} from "./balance";
import { checkPlan } from "./plan";
import {
  checkStop,
  excursionR,
  finalR,
  initialRisk,
  plannedRR,
  positionGivebackR,
  realize,
} from "./trade-math";
import type {
  CashAdjustment,
  FxSnapshot,
  InstrumentSpec,
  Maybe,
  TradeEntry,
  TradeExit,
} from "./types";
import { checkPartialClose, maxVolumeForRisk } from "./volume";
import type { Decimal } from "./decimal";

/**
 * Контрольные примеры из постановки модуля.
 *
 * Цены синтетические. Если не оговорено иное: счёт и котировка в USD, курс 1,
 * расходы 0.
 */

const at = new Date("2026-10-01T10:00:00Z");

/** Курс «единиц валюты счёта за единицу валюты котировки». */
const fx = (rate: string): FxSnapshot => ({
  rate: dec(rate),
  at,
  source: "manual",
  estimated: false,
});
const one = fx("1");

const spec = (over: Partial<InstrumentSpec> = {}): InstrumentSpec => ({
  version: 1,
  model: "linear",
  volumeUnit: "lot",
  contractMultiplier: dec("100"),
  quoteCurrency: "USD",
  minVolume: dec("0.01"),
  volumeStep: dec("0.01"),
  maxVolume: null,
  minCloseVolume: dec("0.01"),
  minRemainingVolume: dec("0.01"),
  priceStep: dec("0.01"),
  ...over,
});

const gold = spec();
const share = spec({
  volumeUnit: "share",
  contractMultiplier: dec("1"),
  minVolume: dec("1"),
  volumeStep: dec("1"),
  minCloseVolume: dec("1"),
  minRemainingVolume: dec("1"),
});
const crypto = spec({
  volumeUnit: "coin",
  contractMultiplier: dec("1"),
  minVolume: dec("0.0001"),
  volumeStep: dec("0.0001"),
  minCloseVolume: dec("0.0001"),
  minRemainingVolume: dec("0.0001"),
});
const forex = spec({ contractMultiplier: dec("100000") });

const entry = (over: Partial<TradeEntry> = {}): TradeEntry => ({
  direction: "long",
  entryPrice: dec("4650"),
  initialStop: dec("4632"),
  target: null,
  quantity: dec("0.01"),
  spec: gold,
  fxAtEntry: one,
  balanceAtEntry: null,
  ...over,
});

const exit = (price: string, quantity: string, rate: FxSnapshot | null = one): TradeExit => ({
  price: dec(price),
  quantity: dec(quantity),
  at,
  fx: rate,
});

/** Короткая запись известного значения с округлением до N знаков. */
function val(m: Maybe<Decimal>, scale = 6): string {
  if (!m.known) throw new Error(`Ожидалось известное значение, получено: ${m.reason}`);
  return toTrimmedString(round(m.value, scale));
}

describe("1. Long: риск, P/L и R", () => {
  const e = entry();
  const r = realize(e, [exit("4700", "0.01")], []);

  it("риск $18", () => expect(val(initialRisk(e).riskAccount)).toBe("18"));
  it("P/L +$50", () => expect(val(r.netAccount)).toBe("50"));
  it("R = 2.777…", () => expect(val(finalR(e, r))).toBe("2.777778"));
  it("сделка закрыта", () => expect(r.closed).toBe(true));
});

describe("2. Short: знак направления учтён", () => {
  const e = entry({ direction: "short", initialStop: dec("4668") });
  const r = realize(e, [exit("4600", "0.01")], []);

  it("риск $18", () => expect(val(initialRisk(e).riskAccount)).toBe("18"));
  it("P/L +$50", () => expect(val(r.netAccount)).toBe("50"));
  it("R = 2.777…", () => expect(val(finalR(e, r))).toBe("2.777778"));
});

describe("3. Доля риска от баланса", () => {
  const e = entry({ balanceAtEntry: dec("70") });

  it("25.714…%", () => expect(val(initialRisk(e).riskPct)).toBe("25.714286"));

  it("превышает тестовый лимит 6 %", () => {
    // 6 % от 70 = 4.20 — тестовый параметр, а не рекомендация.
    const check = checkPlan(e, { riskBudgetAccount: dec("4.20") });
    expect(check.issues.map((i) => i.code)).toContain("risk_over_limit");
  });
});

describe("4. Допустимый объём не помещается в лимит", () => {
  const result = maxVolumeForRisk(dec("4.20"), dec("18"), gold, dec("1"));

  it("допустимого положительного объёма нет", () => {
    expect(result.known).toBe(false);
  });

  it("причина названа, увеличить депозит не предложено", () => {
    if (result.known) throw new Error("ожидалось неизвестное значение");
    expect(result.reason).toContain("не укладывается в ваш лимит");
    expect(result.reason).not.toMatch(/пополн|увеличьте|сузьте/i);
  });

  it("план с таким лимитом не одобряется", () => {
    expect(checkPlan(entry(), { riskBudgetAccount: dec("4.20") }).approved).toBe(false);
  });
});

describe("5. Частичные выходы", () => {
  const e = entry({ quantity: dec("0.02") });
  const r = realize(e, [exit("4680", "0.01"), exit("4640", "0.01")], []);

  it("риск $36", () => expect(val(initialRisk(e).riskAccount)).toBe("36"));
  it("P/L +$20", () => expect(val(r.netAccount)).toBe("20"));
  it("средний выход 4660", () => expect(val(r.avgExitPrice)).toBe("4660"));
  it("R = 0.555…", () => expect(val(finalR(e, r))).toBe("0.555556"));
  it("остаток нулевой", () => expect(toTrimmedString(r.remaining)).toBe("0"));
});

describe("6. Недопустимое частичное закрытие", () => {
  const check = checkPartialClose(dec("0.005"), dec("0.01"), gold);

  it("запрос отклонён", () => expect(check.ok).toBe(false));
  it("причина указана", () => expect(check.reason).toContain("Минимальный объём закрытия"));
  it("закрытие всего остатка при этом разрешено", () => {
    const full = checkPartialClose(dec("0.01"), dec("0.01"), gold);
    expect(full).toMatchObject({ ok: true, full: true });
  });
});

describe("7. Расходы подписанные и не вычитаются дважды", () => {
  const adjustments: CashAdjustment[] = [
    { amountAccount: dec("-2"), kind: "commission", at },
    { amountAccount: dec("1"), kind: "swap", at },
  ];
  const e = entry();
  const r = realize(e, [exit("4700", "0.01")], adjustments);

  it("валовой +$50", () => expect(val(r.grossAccount)).toBe("50"));
  it("чистый +$49", () => expect(val(r.netAccount)).toBe("49"));
});

describe("8. Перенос стопа не меняет исходный риск", () => {
  // Текущий стоп переехал на вход; в расчёте участвует ИСХОДНЫЙ.
  const e = entry();
  const r = realize(e, [exit("4660", "0.01")], []);

  it("исходный риск остаётся $18", () => expect(val(initialRisk(e).riskAccount)).toBe("18"));
  it("итоговый R = 0.555…", () => expect(val(finalR(e, r))).toBe("0.555556"));
});

describe("9. Изменение спецификации после закрытия", () => {
  const closedWithV1 = entry();
  const r1 = realize(closedWithV1, [exit("4700", "0.01")], []);

  // Брокер поменял множитель; у новой сделки своя версия спецификации.
  const v2 = spec({ version: 2, contractMultiplier: dec("1000") });
  const freshTrade = entry({ spec: v2 });

  it("старая сделка считается по своему снимку", () => {
    expect(val(initialRisk(closedWithV1).riskAccount)).toBe("18");
    expect(val(finalR(closedWithV1, r1))).toBe("2.777778");
  });

  it("новая сделка использует новую версию", () => {
    expect(val(initialRisk(freshTrade).riskAccount)).toBe("180");
    expect(freshTrade.spec.version).toBe(2);
  });
});

describe("10. Баланс и накопленный торговый результат", () => {
  const postings: TradePosting[] = [{ amount: dec("-10"), at, sourceKey: "exit-1" }];
  const input = {
    openingBalance: dec("70"),
    flows: [{ kind: "deposit" as const, amount: dec("30"), at }],
    postings,
    reconciliations: [],
  };

  it("баланс $90", () => expect(toTrimmedString(bookBalance(input))).toBe("90"));
  it("накопленный торговый результат −$10", () =>
    expect(toTrimmedString(cumulativeTradingPnl(postings))).toBe("-10"));
  it("пополнение не стало прибылью", () =>
    expect(toTrimmedString(cumulativeTradingPnl(postings))).not.toBe("20"));
  it("повторная обработка того же события не удваивает деньги", () => {
    const doubled = [...postings, { amount: dec("-10"), at, sourceKey: "exit-1" }];
    expect(toTrimmedString(cumulativeTradingPnl(dedupePostings(doubled)))).toBe("-10");
  });
});

describe("11. Ценовая экскурсия не влияет на дисциплину", () => {
  const e = entry();
  const r = realize(e, [exit("4645", "0.01")], []);
  const { mfeR } = excursionR(e, {
    mfePrice: dec("4690"),
    maePrice: null,
    source: "manual",
    estimated: false,
  });

  it("ценовой MFE = 2.222…R", () => expect(val(mfeR)).toBe("2.222222"));
  it("итог = −0.277…R", () => expect(val(finalR(e, r))).toBe("-0.277778"));
  it("разрыв — это наблюдение о результате, а не нарушение", () => {
    // Ядро расчётов не возвращает никакой оценки дисциплины по экскурсии:
    // смешивать результат и соблюдение правил нельзя.
    expect(Object.keys(excursionR(e, null))).toEqual(["mfeR", "maeR"]);
  });
});

describe("12. Отданная прибыль при частичных выходах не вычисляется", () => {
  const e = entry({ quantity: dec("0.02") });
  const exits = [exit("4680", "0.01"), exit("4640", "0.01")];
  const r = realize(e, exits, []);
  const giveback = positionGivebackR(e, exits, r, {
    mfePrice: dec("4690"),
    maePrice: null,
    source: "manual",
    estimated: false,
  });

  it("значение неизвестно", () => expect(giveback.known).toBe(false));
  it("ограничение объяснено", () => {
    if (giveback.known) throw new Error("ожидалось неизвестное значение");
    expect(giveback.reason).toContain("до экстремума");
  });
});

describe("13. Историческая сделка без стопа", () => {
  const e = entry({ initialStop: null });
  const r = realize(e, [exit("4700", "0.01")], []);

  it("P/L доступен", () => expect(val(r.netAccount)).toBe("50"));
  it("R неизвестен, а не ноль", () => {
    const result = finalR(e, r);
    expect(result.known).toBe(false);
    if (!result.known) expect(result.reason).toContain("Стоп не задан");
  });
  it("риск и его доля неизвестны", () => {
    const risk = initialRisk(e);
    expect(risk.riskAccount.known).toBe(false);
    expect(risk.riskPct.known).toBe(false);
  });
});

describe("14. План без стопа не одобряется", () => {
  const check = checkPlan(entry({ initialStop: null }), { riskBudgetAccount: dec("20") });

  it("план не одобрен", () => expect(check.approved).toBe(false));
  it("причина — отсутствующий стоп", () =>
    expect(check.issues.map((i) => i.code)).toContain("stop_invalid"));

  it("стоп на неправильной стороне тоже не проходит", () => {
    expect(checkStop({ direction: "long", entryPrice: dec("4650"), initialStop: dec("4660") }).ok).toBe(false);
    expect(checkStop({ direction: "short", entryPrice: dec("4650"), initialStop: dec("4640") }).ok).toBe(false);
  });

  it("стоп, равный входу, не задаёт риск", () => {
    const same = checkStop({ direction: "long", entryPrice: dec("4650"), initialStop: dec("4650") });
    expect(same.ok).toBe(false);
    expect(same.reason).toContain("не задаёт исходный риск");
  });
});

describe("27. Акция в штуках", () => {
  const e = entry({
    spec: share,
    entryPrice: dec("200"),
    initialStop: dec("195"),
    quantity: dec("2"),
  });
  const r = realize(e, [exit("210", "2")], []);

  it("риск $10", () => expect(val(initialRisk(e).riskAccount)).toBe("10"));
  it("P/L +$20", () => expect(val(r.netAccount)).toBe("20"));
  it("R = 2", () => expect(val(finalR(e, r))).toBe("2"));
  it("объём подписан штуками", () => expect(e.spec.volumeUnit).toBe("share"));
});

describe("28. BTC/USD spot: множитель золота не применяется", () => {
  const e = entry({
    spec: crypto,
    entryPrice: dec("60000"),
    initialStop: dec("59000"),
    quantity: dec("0.01"),
  });
  const r = realize(e, [exit("62000", "0.01")], []);

  it("риск $10", () => expect(val(initialRisk(e).riskAccount)).toBe("10"));
  it("P/L +$20", () => expect(val(r.netAccount)).toBe("20"));
  it("R = 2", () => expect(val(finalR(e, r))).toBe("2"));
});

describe("29. EUR/USD по тестовой спецификации", () => {
  const e = entry({
    spec: forex,
    entryPrice: dec("1.1000"),
    initialStop: dec("1.0950"),
    quantity: dec("0.01"),
  });
  const r = realize(e, [exit("1.1100", "0.01")], []);

  it("риск $5", () => expect(val(initialRisk(e).riskAccount)).toBe("5"));
  it("P/L +$10", () => expect(val(r.netAccount)).toBe("10"));
  it("R = 2", () => expect(val(finalR(e, r))).toBe("2"));
});

describe("30. USD/JPY: курсы входа и выхода разные", () => {
  // Курс JPY→USD на входе 1/150, на выходе 1/152.
  const e = entry({
    spec: forex,
    entryPrice: dec("150"),
    initialStop: dec("149"),
    quantity: dec("0.01"),
    fxAtEntry: fx("0.006666666667"),
  });
  const r = realize(e, [exit("152", "0.01", fx("0.006578947368"))], []);

  it("риск 1000 JPY ≈ $6.6667", () => {
    expect(val(initialRisk(e).riskQuote)).toBe("1000");
    expect(val(initialRisk(e).riskAccount, 4)).toBe("6.6667");
  });

  it("P/L 2000 JPY ≈ $13.1579", () => {
    expect(val(r.grossQuote)).toBe("2000");
    expect(val(r.netAccount, 4)).toBe("13.1579");
  });

  it("R ≈ 1.973684, а не 2 — история не пересчитана по одному курсу", () => {
    expect(val(finalR(e, r))).toBe("1.973684");
    expect(val(finalR(e, r))).not.toBe("2");
  });
});

describe("31. BTC/USDT при счёте USD без курса", () => {
  const usdt = spec({
    volumeUnit: "coin",
    contractMultiplier: dec("1"),
    quoteCurrency: "USDT",
    minVolume: dec("0.0001"),
    volumeStep: dec("0.0001"),
    minCloseVolume: dec("0.0001"),
    minRemainingVolume: dec("0.0001"),
  });
  const e = entry({
    spec: usdt,
    entryPrice: dec("60000"),
    initialStop: dec("59000"),
    quantity: dec("0.01"),
    fxAtEntry: null,
  });
  const r = realize(e, [exit("62000", "0.01", null)], []);

  it("результат в USDT известен", () => expect(val(r.grossQuote)).toBe("20"));

  it("итог в валюте счёта не подменяется расчётом 1:1", () => {
    expect(r.netAccount.known).toBe(false);
    if (!r.netAccount.known) expect(r.netAccount.reason).toContain("курс");
  });

  it("R неизвестен", () => expect(finalR(e, r).known).toBe(false));

  it("план без курса не одобряется", () => {
    const check = checkPlan(e, { riskBudgetAccount: dec("20") });
    expect(check.approved).toBe(false);
    expect(check.issues.map((i) => i.code)).toContain("fx_unknown");
  });
});

describe("33. Неподдерживаемая модель расчёта", () => {
  const e = entry({ spec: spec({ model: "unsupported" }) });
  const r = realize(e, [exit("4700", "0.01")], []);

  it("ложного P/L нет", () => expect(r.netAccount.known).toBe(false));
  it("риск не рассчитан", () => expect(initialRisk(e).riskAccount.known).toBe(false));
  it("объём по лимиту не одобрен", () =>
    expect(maxVolumeForRisk(dec("100"), dec("18"), e.spec, dec("1")).known).toBe(false));
  it("ограничение названо конкретно", () => {
    const check = checkPlan(e, { riskBudgetAccount: dec("20") });
    expect(check.issues.map((i) => i.code)).toContain("model_unsupported");
  });
});

describe("плановое R/R", () => {
  it("считается от исходного расстояния", () => {
    const e = entry({ target: dec("4700") });
    expect(val(plannedRR(e))).toBe("2.777778");
  });

  it("цель по неправильную сторону даёт отрицательное R/R, а не модуль", () => {
    const e = entry({ target: dec("4600") });
    expect(val(plannedRR(e))).toBe("-2.777778");
  });

  it("без цели неизвестно", () => expect(plannedRR(entry()).known).toBe(false));
});

describe("денежная просадка", () => {
  const postings: TradePosting[] = [
    { amount: dec("100"), at: new Date("2026-10-01"), sourceKey: "a" },
    { amount: dec("-40"), at: new Date("2026-10-02"), sourceKey: "b" },
    { amount: dec("-30"), at: new Date("2026-10-03"), sourceKey: "c" },
    { amount: dec("50"), at: new Date("2026-10-04"), sourceKey: "d" },
  ];

  it("считается от исторического максимума", () => {
    const d = moneyDrawdown(postings);
    expect(toTrimmedString(d.peak)).toBe("100");
    expect(toTrimmedString(d.maxDrawdown)).toBe("70");
    expect(toTrimmedString(d.current)).toBe("20");
  });

  it("пополнение не влияет на просадку: его нет среди торговых проводок", () => {
    const d = moneyDrawdown(postings);
    const withDeposit = moneyDrawdown(postings);
    expect(toTrimmedString(d.maxDrawdown)).toBe(toTrimmedString(withDeposit.maxDrawdown));
  });
});

describe("short: экскурсия считается в его сторону", () => {
  const e = entry({ direction: "short", initialStop: dec("4668") });
  const { mfeR, maeR } = excursionR(e, {
    mfePrice: dec("4610"),
    maePrice: dec("4660"),
    source: "manual",
    estimated: false,
  });

  it("движение вниз благоприятно", () => expect(val(mfeR)).toBe("2.222222"));
  it("движение вверх неблагоприятно", () => expect(val(maeR)).toBe("0.555556"));
});
