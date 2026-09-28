// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionEdit } from "./transaction-edit";
import type { DemoTransaction } from "@/lib/demo/types";

/** Операция 26 сентября, 14:30 по времени учёта (UTC+6). */
const tx: DemoTransaction = {
  id: "t1",
  kind: "expense",
  amountMinor: 25000,
  currency: "KGS",
  category: "transport",
  description: "Такси",
  occurredAt: new Date("2026-09-26T08:30:00Z"),
  day: "2026-09-26",
};

function setup(over: Partial<DemoTransaction> = {}) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <TransactionEdit
      tx={{ ...tx, ...over }}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
    />,
  );
  return { onSave, onDelete, onClose, user: userEvent.setup() };
}

const amountField = () => screen.getByLabelText("Сумма");

describe("Правка операции", () => {
  it("подставляет текущие значения, включая время в зоне учёта", () => {
    setup();
    expect(screen.getByLabelText("Описание")).toHaveValue("Такси");
    expect(amountField()).toHaveValue("250");
    expect(screen.getByLabelText("Когда")).toHaveValue("2026-09-26T14:30");
    expect(screen.getByRole("radio", { name: "Расход" })).toHaveAttribute("aria-checked", "true");
  });

  it("сохраняет новую сумму в минорных единицах", async () => {
    const { onSave, user } = setup();
    await user.clear(amountField());
    await user.type(amountField(), "310,50");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ amountMinor: 31050, description: "Такси" });
  });

  it("не принимает пустое описание и нечисловую сумму", async () => {
    const { onSave, user } = setup();
    await user.clear(screen.getByLabelText("Описание"));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Опишите операцию");

    await user.type(screen.getByLabelText("Описание"), "Такси");
    await user.clear(amountField());
    await user.type(amountField(), "около трёхсот");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("положительным числом");
  });

  it("пересчитывает финансовый день по новому времени и предупреждает о переносе", async () => {
    const { onSave, user } = setup();
    // 00:30 следующих суток — это ещё 26 сентября: граница дня в 01:00.
    await user.clear(screen.getByLabelText("Когда"));
    await user.type(screen.getByLabelText("Когда"), "2026-09-28T00:30");
    expect(screen.getByText(/переедет в другой финансовый день/)).toHaveTextContent("27 сентября");

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave.mock.calls[0][0].day).toBe("2026-09-27");
  });

  it("у дохода нет категории, и выбор категории не показывается", async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole("radio", { name: "Доход" }));
    expect(screen.queryByRole("button", { name: /Транспорт/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ kind: "income", category: null });
  });

  it("требует категорию, если доход переделали в расход", async () => {
    const { onSave, user } = setup({ kind: "income", category: null });
    await user.click(screen.getByRole("radio", { name: "Расход" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите категорию");

    await user.click(screen.getByRole("button", { name: /Транспорт/ }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ kind: "expense", category: "transport" });
  });

  it("удаление требует подтверждения", async () => {
    const { onDelete, user } = setup();
    await user.click(screen.getByRole("button", { name: "Удалить" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Точно удалить?" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("закрывается по Escape", async () => {
    const { onClose, user } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
