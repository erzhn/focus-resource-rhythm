import { describe, expect, it } from "vitest";
import { buildGoalTree } from "./goal-tree";

const areas = [
  { id: "a1", name: "Здоровье", color: "#0a0" },
  { id: "a2", name: "Работа", color: "#00a" },
  { id: "a3", name: "Пустая", color: "#555" },
];
const results = [
  { id: "r1", title: "Бегать", kind: "goal" as const, zone: "now", progress: 0.5, lifeAreaId: "a1" },
  { id: "r2", title: "Сон", kind: "project" as const, zone: "next", progress: 1, lifeAreaId: "a1" },
  { id: "r3", title: "Проект X", kind: "project" as const, zone: "now", progress: 0, lifeAreaId: "a2" },
];
const tasks = [
  { id: "t1", title: "Купить кроссовки", status: "done", resultId: "r1" },
  { id: "t2", title: "Пробежка 3 км", status: "planned", resultId: "r1" },
  { id: "t3", title: "Отмена", status: "cancelled", resultId: "r3" },
];

describe("buildGoalTree", () => {
  it("пропускает сферы без результатов", () => {
    const tree = buildGoalTree(areas, results, tasks);
    expect(tree.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("считает средний прогресс по результатам сферы", () => {
    const tree = buildGoalTree(areas, results, tasks);
    const health = tree.find((a) => a.id === "a1")!;
    expect(health.avgProgress).toBeCloseTo(0.75); // (0.5 + 1) / 2
  });

  it("берёт ближайшим действием первую активную задачу и считает выполненные", () => {
    const tree = buildGoalTree(areas, results, tasks);
    const run = tree[0].results.find((r) => r.id === "r1")!;
    expect(run.nextActionTitle).toBe("Пробежка 3 км");
    expect(run.doneCount).toBe(1);
    expect(run.taskCount).toBe(2);
  });

  it("нет активных задач → ближайшее действие null", () => {
    const tree = buildGoalTree(areas, results, tasks);
    const projX = tree.find((a) => a.id === "a2")!.results[0];
    expect(projX.nextActionTitle).toBeNull(); // единственная задача отменена
  });
});
