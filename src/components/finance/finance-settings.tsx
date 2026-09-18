"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Card, CardTitle, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { currencyLabel, parseAmountToMinor } from "@/domain/finance/format";

/**
 * Настройки учёта: начальный баланс и бюджеты.
 *
 * Пустое поле означает «не задано» и сохраняется как null — баланс и лимиты
 * не придумываются за пользователя. Суммы вводятся в обычных единицах,
 * внутрь уходят минорные.
 */
export function FinanceSettings() {
  const { state, setFinanceSettings, moneyLimitMinor } = useStore();
  const toast = useToast();
  const currency = state.mainCurrency ?? "KGS";

  const toInput = (minor: number | null) => (minor === null ? "" : String(minor / 100));

  const [balance, setBalance] = useState(() => toInput(state.openingBalanceMinor));
  // Показываем ДЕЙСТВУЮЩИЙ лимит, а не только новое поле: иначе у профиля со
  // старым лимитом из онбординга поле выглядело пустым, хотя бюджет работал.
  const [daily, setDaily] = useState(() => toInput(moneyLimitMinor));
  const [monthly, setMonthly] = useState(() => toInput(state.monthlyBudgetMinor));
  const [error, setError] = useState<string | null>(null);

  const read = (raw: string): number | null | "bad" => {
    if (!raw.trim()) return null; // пусто — значит не задано
    const minor = parseAmountToMinor(raw);
    return minor === null ? "bad" : minor;
  };

  const save = () => {
    const values = { balance: read(balance), daily: read(daily), monthly: read(monthly) };
    if (Object.values(values).includes("bad")) {
      setError("Сумма должна быть положительным числом. Оставьте поле пустым, если ограничение не нужно.");
      return;
    }
    setError(null);
    setFinanceSettings({
      openingBalanceMinor: values.balance as number | null,
      dailyBudgetMinor: values.daily as number | null,
      monthlyBudgetMinor: values.monthly as number | null,
    });
    toast.success("Настройки учёта сохранены");
  };

  return (
    <Card>
      <CardTitle className="flex items-center gap-1.5">
        <Wallet className="h-3.5 w-3.5" /> Учёт денег
      </CardTitle>
      <p className="mt-2 text-sm text-muted">
        Бюджеты показываются на экране «Деньги». Пустое поле — ограничения нет.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field
          id="fin-balance"
          label="Начальный баланс"
          hint="От него считается остаток"
          value={balance}
          onChange={setBalance}
          currency={currency}
        />
        <Field
          id="fin-daily"
          label="Бюджет на день"
          hint="Кольцо на экране «Деньги»"
          value={daily}
          onChange={setDaily}
          currency={currency}
        />
        <Field
          id="fin-monthly"
          label="Бюджет на месяц"
          hint="Предупреждение при превышении"
          value={monthly}
          onChange={setMonthly}
          currency={currency}
        />
      </div>

      {error && (
        <p className="mt-3 text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]">
          {error}
        </p>
      )}

      <div className="mt-4">
        <Button size="sm" onClick={save}>
          Сохранить
        </Button>
      </div>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  currency,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  currency: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="не задан"
          className="w-full rounded-[var(--r-sm)] border border-border bg-surface-2 py-2 pl-3 pr-12 text-sm outline-none focus:border-primary"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-2">
          {currencyLabel(currency)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-2">{hint}</p>
    </div>
  );
}
