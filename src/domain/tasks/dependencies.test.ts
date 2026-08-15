import { describe, expect, it } from "vitest";
import { createsDependencyCycle, type DependencyEdge } from "./dependencies";

describe("createsDependencyCycle", () => {
  it("самозависимость — цикл", () => {
    expect(createsDependencyCycle([], "a", "a")).toBe(true);
  });

  it("новое независимое ребро цикла не создаёт", () => {
    expect(createsDependencyCycle([], "a", "b")).toBe(false);
  });

  it("прямой обратный цикл обнаруживается", () => {
    // b уже зависит от a; добавить «a зависит от b» → цикл.
    const edges: DependencyEdge[] = [{ taskId: "b", dependsOnId: "a" }];
    expect(createsDependencyCycle(edges, "a", "b")).toBe(true);
  });

  it("транзитивный цикл обнаруживается", () => {
    // c→b→a; добавить a зависит от c → цикл a→c→b→a.
    const edges: DependencyEdge[] = [
      { taskId: "b", dependsOnId: "a" },
      { taskId: "c", dependsOnId: "b" },
    ];
    expect(createsDependencyCycle(edges, "a", "c")).toBe(true);
  });

  it("параллельные зависимости без цикла разрешены", () => {
    const edges: DependencyEdge[] = [
      { taskId: "b", dependsOnId: "a" },
      { taskId: "c", dependsOnId: "a" },
    ];
    expect(createsDependencyCycle(edges, "d", "b")).toBe(false);
  });
});
