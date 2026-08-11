import { describe, expect, it } from "vitest";
import { TemplateFormulationService } from "./index";

const svc = new TemplateFormulationService();

describe("TemplateFormulationService", () => {
  it("работает без внешнего LLM и помечает источник как шаблон", () => {
    const s = svc.suggest({ title: "отчёт" });
    expect(s.source).toBe("template");
  });

  it("предлагает добавить действие, если задача не начинается с глагола", () => {
    const s = svc.suggest({ title: "квартальный отчёт" });
    expect(s.improvedTitle.toLowerCase()).toContain("подготовить");
  });

  it("не переписывает заголовок, если он уже начинается с действия", () => {
    const s = svc.suggest({ title: "Написать письмо клиенту" });
    expect(s.improvedTitle).toBe("Написать письмо клиенту");
  });

  it("советует разбить задачу дольше 90 минут", () => {
    const s = svc.suggest({ title: "большой проект", plannedMinutes: 120 });
    expect(s.resourceHint).toContain("разбить");
  });

  it("подсказывает про срок, если он не задан", () => {
    const s = svc.suggest({ title: "идея" });
    expect(s.realisticDueHint.toLowerCase()).toContain("срок не задан");
  });
});
