import { describe, expect, it } from "vitest";
import { buildDayPlan } from "./dayPlan";
import type { PriorityContext } from "@/domain/priority";
import { makeResources, makeTask } from "@/domain/__tests__/factories";

const ctx: PriorityContext = {
  now: new Date("2026-08-05T00:00:00"),
  resources: makeResources(),
  completedTaskIds: new Set<string>(),
};

describe("buildDayPlan", () => {
  it("выбирает одно главное дело и не более двух дополнительных", () => {
    const tasks = [
      makeTask({ id: "1", importance: 5, dueDate: new Date("2026-08-05") }),
      makeTask({ id: "2", importance: 4 }),
      makeTask({ id: "3", importance: 3 }),
      makeTask({ id: "4", importance: 2 }),
      makeTask({ id: "5", importance: 1 }),
    ];
    const plan = buildDayPlan(tasks, makeResources(), ctx);
    expect(plan.main).not.toBeNull();
    expect(plan.main!.task.id).toBe("1");
    expect(plan.secondary.length).toBeLessThanOrEqual(2);
  });

  it("обязательные повторяющиеся дела включаются сверх лимита 1+2", () => {
    const tasks = [
      makeTask({ id: "rec", isRecurringToday: true, plannedMinutes: 15 }),
      makeTask({ id: "1", importance: 5 }),
      makeTask({ id: "2", importance: 4 }),
      makeTask({ id: "3", importance: 3 }),
    ];
    const plan = buildDayPlan(tasks, makeResources(), ctx);
    expect(plan.recurring.map((p) => p.task.id)).toContain("rec");
    expect(plan.main).not.toBeNull();
    expect(plan.secondary).toHaveLength(2);
  });

  it("исключает заблокированные зависимостью задачи из плана", () => {
    const tasks = [
      makeTask({ id: "blocked", dependsOn: ["x"], importance: 5 }),
      makeTask({ id: "free", importance: 3 }),
    ];
    const plan = buildDayPlan(tasks, makeResources(), ctx);
    expect(plan.blocked.map((t) => t.id)).toContain("blocked");
    expect(plan.main!.task.id).toBe("free");
  });

  it("удерживает резерв времени и не добавляет задачи сверх бюджета", () => {
    const tasks = [
      makeTask({ id: "1", importance: 5, plannedMinutes: 300 }),
      makeTask({ id: "2", importance: 4, plannedMinutes: 300 }),
    ];
    const plan = buildDayPlan(tasks, makeResources({ availableMinutes: 480 }), ctx);
    expect(plan.reserveMinutes).toBe(120);
    expect(plan.plannableMinutes).toBe(360);
    // Вторая задача не помещается в бюджет 360 — план её не берёт.
    expect(plan.secondary).toHaveLength(0);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(360);
  });

  it("предупреждает о перегрузке, когда главное дело больше бюджета", () => {
    const tasks = [makeTask({ id: "1", importance: 5, plannedMinutes: 500 })];
    const plan = buildDayPlan(tasks, makeResources({ availableMinutes: 480 }), ctx);
    expect(plan.plannableMinutes).toBe(360);
    expect(plan.warnings.some((w) => w.includes("не помещается") || w.includes("Перегрузка"))).toBe(true);
  });

  it("при низком уровне сил тяжёлую задачу включает с предупреждением", () => {
    const tasks = [makeTask({ id: "hard", importance: 5, energyRequired: 5 })];
    const plan = buildDayPlan(tasks, makeResources({ energyLevel: 1 }), ctx);
    expect(plan.warnings.some((w) => w.includes("сил"))).toBe(true);
  });
});
