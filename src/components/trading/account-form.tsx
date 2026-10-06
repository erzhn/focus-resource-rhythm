"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createAccount } from "@/lib/trading/actions";

/**
 * Создание торгового счёта.
 *
 * Начальный баланс фиксируется на дату начала учёта ровно один раз: всё
 * последующее — пополнения и выводы, которые прибылью не являются.
 */

const inputCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

export function AccountForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [broker, setBroker] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timezone, setTimezone] = useState("Asia/Bishkek");
  const [isDemo, setIsDemo] = useState(false);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createAccount({
        title,
        broker,
        currency,
        openingBalance,
        openingDate,
        timezone,
        isDemo,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Счёт «${title}» создан`);
      setTitle("");
      setOpeningBalance("");
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Новый счёт
      </Button>
    );
  }

  return (
    <Card>
      <CardTitle>Новый счёт</CardTitle>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-muted">Название</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Основной счёт"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Брокер</span>
          <input value={broker} onChange={(e) => setBroker(e.target.value)} className={inputCls} />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Валюта счёта</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Начальный баланс</span>
          <input
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Дата начала учёта</span>
          <input
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-muted">Часовой пояс счёта</span>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Asia/Bishkek"
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-muted-2">
            По нему считаются границы дня: дневные лимиты и дневник.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
          Демосчёт — для знакомства с модулем, в аналитику боевых счетов не попадает
        </label>

        {error && (
          <p
            role="alert"
            className="text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))] sm:col-span-2"
          >
            {error}
          </p>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Создаю…" : "Создать"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </form>
    </Card>
  );
}
