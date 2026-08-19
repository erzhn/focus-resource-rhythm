// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressRing } from "./progress-ring";

describe("ProgressRing", () => {
  it("выставляет доступное имя с процентом по умолчанию", () => {
    render(<ProgressRing value={0.42} />);
    expect(screen.getByRole("img", { name: "Прогресс 42%" })).toBeInTheDocument();
  });

  it("уважает переданный label", () => {
    render(<ProgressRing value={0.5} label="Выполнение целей" />);
    expect(screen.getByRole("img", { name: "Выполнение целей" })).toBeInTheDocument();
  });

  it("ограничивает значение диапазоном 0..1 в подписи", () => {
    render(<ProgressRing value={1.8} />);
    expect(screen.getByRole("img", { name: "Прогресс 100%" })).toBeInTheDocument();
  });

  it("рендерит дочернюю подпись", () => {
    render(
      <ProgressRing value={0.3}>
        <span>30</span>
      </ProgressRing>,
    );
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});
