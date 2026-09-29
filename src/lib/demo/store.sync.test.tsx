// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Поведение при неудачной записи в базу.
 *
 * Раньше ошибка уходила только в консоль: на экране изменение выглядело
 * сохранённым, а после перезагрузки исчезало. Проверяем, что теперь оно
 * откатывается к тому, что реально лежит в базе, и что об этом сообщают.
 */

// Провайдер выбирается по переменным окружения — притворяемся, что база настроена.
vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: true,
  isDemoMode: false,
  supabaseUrl: "https://example.test",
  supabaseAnonKey: "anon",
}));

/** Управляемый двойник Supabase: снимок задаём мы, запись падает по команде. */
const fake = {
  writeFails: false,
  loadCalls: 0,
  snapshotTransactions: [] as unknown[],
};

vi.mock("@/lib/data/supabase-provider", async () => {
  const { createEmptyState } = await import("@/lib/demo/seed");
  return {
    SupabaseDataProvider: class {
      readonly mode = "supabase" as const;
      async loadSnapshot() {
        fake.loadCalls += 1;
        const state = createEmptyState();
        state.transactions = fake.snapshotTransactions as typeof state.transactions;
        return state;
      }
      async addTransaction() {
        if (fake.writeFails) throw new Error("сеть недоступна");
      }
    },
  };
});

const { DemoStoreProvider, useStore } = await import("@/lib/demo/store");
const { ToastProvider } = await import("@/components/ui/toast");
const { SyncStatus } = await import("@/components/sync-status");

function Harness() {
  const { state, addTransaction, syncError } = useStore();
  return (
    <div>
      <button
        onClick={() =>
          addTransaction({ kind: "expense", amountMinor: 25000, category: "food", description: "Обед" })
        }
      >
        записать
      </button>
      <p data-testid="count">{state.transactions.length}</p>
      <p data-testid="error">{syncError?.message ?? ""}</p>
    </div>
  );
}

function setup() {
  render(
    <DemoStoreProvider>
      <ToastProvider>
        <SyncStatus />
        <Harness />
      </ToastProvider>
    </DemoStoreProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  fake.writeFails = false;
  fake.loadCalls = 0;
  fake.snapshotTransactions = [];
});

describe("неудачная запись в базу", () => {
  it("успешная запись остаётся на экране и ничего не сообщает", async () => {
    const user = setup();
    await waitFor(() => expect(fake.loadCalls).toBe(1));

    await user.click(screen.getByRole("button", { name: "записать" }));

    expect(screen.getByTestId("count")).toHaveTextContent("1");
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent(""));
    expect(fake.loadCalls).toBe(1); // перечитывать нечего
  });

  it("при ошибке откатывает изменение к состоянию базы", async () => {
    fake.writeFails = true;
    const user = setup();
    await waitFor(() => expect(fake.loadCalls).toBe(1));

    await user.click(screen.getByRole("button", { name: "записать" }));

    // Запись не прошла — экран возвращается к тому, что лежит в базе.
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));
    expect(fake.loadCalls).toBe(2);
  });

  it("объясняет, что именно не сохранилось", async () => {
    fake.writeFails = true;
    const user = setup();
    await waitFor(() => expect(fake.loadCalls).toBe(1));

    await user.click(screen.getByRole("button", { name: "записать" }));

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Не удалось сохранить: запись операции. Изменение отменено.",
      ),
    );
    // И это видно пользователю, а не только в консоли.
    const toasts = within(screen.getByRole("region", { name: "Уведомления" }));
    expect(await toasts.findByText(/Не удалось сохранить: запись операции/)).toBeInTheDocument();
  });

  it("повторная неудача показывается снова, а не проглатывается", async () => {
    fake.writeFails = true;
    const user = setup();
    await waitFor(() => expect(fake.loadCalls).toBe(1));

    await user.click(screen.getByRole("button", { name: "записать" }));
    await waitFor(() => expect(screen.getByTestId("error")).not.toHaveTextContent(""));

    await user.click(screen.getByRole("button", { name: "записать" }));
    await waitFor(() => expect(fake.loadCalls).toBeGreaterThan(2));
  });
});
