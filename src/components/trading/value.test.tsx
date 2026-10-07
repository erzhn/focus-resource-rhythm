// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, Money, Percent, Quantity, RValue, Unknown } from "./value";

/**
 * Показ величин в интерфейсе.
 *
 * Проверяется ровно одно свойство, но самое важное: неизвестное выглядит
 * неизвестным. Ноль на месте непосчитанного значения — это не косметика, а
 * ложное утверждение, что величину измерили.
 */

describe("неизвестное не выглядит нулём", () => {
  it("деньги", () => {
    render(<Money value={null} currency="USD" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it("R", () => {
    render(<RValue value={null} reason="Стоп не задан" />);
    const node = screen.getByText("—");
    expect(node).toHaveAttribute("title", "Стоп не задан");
    expect(screen.queryByText("0R")).toBeNull();
  });

  it("проценты", () => {
    render(<Percent value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("объём", () => {
    render(<Quantity value={null} unit="lot" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("прочерк объясняет причину", () => {
    render(<Unknown reason="Курс неизвестен" />);
    expect(screen.getByText("—")).toHaveAttribute("title", "Курс неизвестен");
  });
});

describe("знак и единицы видны без цвета", () => {
  it("убыток печатается со знаком, а не только красным", () => {
    render(<Money value="-20" currency="USD" />);
    // Типографский минус перед суммой.
    expect(screen.getByText(/−\$20/)).toBeInTheDocument();
  });

  it("прибыль по запросу печатается с плюсом", () => {
    render(<Money value="49" currency="USD" signed />);
    expect(screen.getByText("+$49")).toBeInTheDocument();
  });

  it("объём всегда подписан единицей", () => {
    render(<Quantity value="0.01" unit="lot" />);
    expect(screen.getByText(/лоты/)).toBeInTheDocument();
  });

  it("R подписан буквой R", () => {
    render(<RValue value="2.7777777778" />);
    expect(screen.getByText("2.77R")).toBeInTheDocument();
  });
});

describe("поле с подписью", () => {
  it("показывает пояснение рядом со значением", () => {
    render(
      <Field label="Риск до стопа" hint="баланс на момент входа неизвестен">
        <Money value={null} currency="USD" />
      </Field>,
    );
    expect(screen.getByText("Риск до стопа")).toBeInTheDocument();
    expect(screen.getByText("баланс на момент входа неизвестен")).toBeInTheDocument();
  });

  it("без пояснения лишнего текста не добавляет", () => {
    const { container } = render(
      <Field label="Объём">
        <Quantity value="2" unit="share" />
      </Field>,
    );
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});
