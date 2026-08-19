// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./toast";

function Harness() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success("Готово")}>показать</button>
      <button onClick={() => toast.warning("Внимание")}>предупредить</button>
    </div>
  );
}

function setup() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

describe("ToastProvider / useToast", () => {
  it("показывает уведомление по требованию", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByText("Готово")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "показать" }));
    expect(screen.getByRole("status")).toHaveTextContent("Готово");
  });

  it("закрывается по кнопке закрытия", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "предупредить" }));
    expect(screen.getByText("Внимание")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Закрыть уведомление" }));
    await waitForElementToBeRemoved(() => screen.queryByText("Внимание"));
  });
});
