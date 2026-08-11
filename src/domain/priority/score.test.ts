import { describe, expect, it } from "vitest";
import { calculatePriority, isBlocked, type PriorityContext } from "./score";
import { resolvePriority } from "./manual";
import { makeResources, makeTask } from "@/domain/__tests__/factories";

const ctx = (over: Partial<PriorityContext> = {}): PriorityContext => ({
  now: new Date("2026-08-05T00:00:00"),
  resources: makeResources(),
  completedTaskIds: new Set<string>(),
  ...over,
});

describe("calculatePriority", () => {
  it("возвращает балл в диапазоне 0–100", () => {
    const r = calculatePriority(makeTask(), ctx());
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("максимально важная срочная задача набирает высокий балл", () => {
    const task = makeTask({
      importance: 5,
      consequence: 5,
      goalLink: 5,
      dueDate: new Date("2026-08-05T00:00:00"),
      linkedToActiveResult: true,
      unblocks: ["a", "b"],
    });
    const r = calculatePriority(task, ctx());
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.explanation).toContain("Высокий приоритет");
  });

  it("срок завтра даёт больше срочности, чем срок через 2 недели", () => {
    const soon = calculatePriority(
      makeTask({ dueDate: new Date("2026-08-06T00:00:00") }),
      ctx(),
    );
    const far = calculatePriority(
      makeTask({ dueDate: new Date("2026-08-25T00:00:00") }),
      ctx(),
    );
    const soonUrg = soon.factors.find((f) => f.key === "urgency")!.points;
    const farUrg = far.factors.find((f) => f.key === "urgency")!.points;
    expect(soonUrg).toBeGreaterThan(farUrg);
  });

  it("просрочка добавляет баллы, но общий максимум не превышает 100", () => {
    const task = makeTask({
      importance: 5,
      consequence: 5,
      goalLink: 5,
      linkedToActiveResult: true,
      unblocks: ["a", "b", "c"],
      dueDate: new Date("2026-07-01T00:00:00"),
    });
    const r = calculatePriority(task, ctx());
    expect(r.score).toBeLessThanOrEqual(100);
    const overdue = r.factors.find((f) => f.key === "overdue")!;
    expect(overdue.points).toBeGreaterThan(0);
  });

  it("несоответствие ресурсам даёт предупреждение, но не убирает задачу", () => {
    const task = makeTask({ plannedMinutes: 600, energyRequired: 5 });
    const r = calculatePriority(task, ctx({ resources: makeResources({ energyLevel: 2 }) }));
    expect(r.resourceWarnings.length).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("превышение денежного лимита попадает в предупреждения", () => {
    const task = makeTask({ plannedMoneyMinor: 500_00 });
    const r = calculatePriority(task, ctx({ resources: makeResources({ moneyLimitMinor: 100_00 }) }));
    expect(r.resourceWarnings.some((w) => w.includes("лимит"))).toBe(true);
  });
});

describe("isBlocked", () => {
  it("заблокирована, пока зависимость не выполнена", () => {
    const task = makeTask({ dependsOn: ["dep1"] });
    expect(isBlocked(task, new Set())).toBe(true);
    expect(isBlocked(task, new Set(["dep1"]))).toBe(false);
  });

  it("заблокированная задача помечается и не рекомендуется", () => {
    const task = makeTask({ dependsOn: ["dep1"] });
    const r = calculatePriority(task, ctx());
    expect(r.blocked).toBe(true);
    expect(r.explanation).toContain("Заблокирована");
  });
});

describe("resolvePriority (ручной override)", () => {
  it("ручной балл имеет приоритет, но системный сохраняется для сравнения", () => {
    const system = calculatePriority(makeTask({ importance: 1 }), ctx());
    const eff = resolvePriority(system, { score: 95, note: "срочно для клиента", at: new Date() });
    expect(eff.effectiveScore).toBe(95);
    expect(eff.isManual).toBe(true);
    expect(eff.system.score).toBe(system.score);
  });

  it("без ручного значения действует системная рекомендация", () => {
    const system = calculatePriority(makeTask(), ctx());
    const eff = resolvePriority(system, null);
    expect(eff.effectiveScore).toBe(system.score);
    expect(eff.isManual).toBe(false);
  });
});
