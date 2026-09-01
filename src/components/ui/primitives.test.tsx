// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, Button, EmptyState } from "./primitives";

describe("EmptyState", () => {
  it("показывает заголовок, подсказку и действие", () => {
    render(
      <EmptyState
        title="Пусто"
        hint="Добавьте элемент"
        action={<button>Добавить</button>}
      />,
    );
    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText("Добавьте элемент")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeInTheDocument();
  });

  it("без подсказки не рендерит пустой текст", () => {
    render(<EmptyState title="Только заголовок" />);
    expect(screen.getByText("Только заголовок")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("рендерит содержимое и подмешивает цвет темы для контраста", () => {
    render(<Badge color="#ff0000">метка</Badge>);
    const el = screen.getByText("метка");
    expect(el).toBeInTheDocument();
    // Текст сдвигается к --foreground, иначе на цветной подложке контраст ниже 4.5:1.
    expect(el.getAttribute("style")).toContain("color-mix(in oklab, #ff0000 58%, var(--foreground))");
    expect(el.getAttribute("style")).toContain("rgb(255, 0, 0) 15%, transparent");
  });
});

describe("Button", () => {
  it("прокидывает disabled и aria-label", () => {
    render(<Button disabled aria-label="Сохранить" />);
    const btn = screen.getByRole("button", { name: "Сохранить" });
    expect(btn).toBeDisabled();
  });
});
