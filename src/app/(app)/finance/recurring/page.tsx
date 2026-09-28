"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Check, Plus, Repeat, Trash2 } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Reveal, RevealList, RevealItem } from "@/components/ui/reveal";
import { useToast } from "@/components/ui/toast";
import { CategoryIcon } from "@/components/finance/category-icon";
import { CATEGORIES, type CategoryId } from "@/domain/finance/categories";
import { currencyLabel, formatMinor, parseAmountToMinor } from "@/domain/finance/format";
import { formatFinancialDay } from "@/domain/finance/day";
import {
  monthlyCommitmentMinor,
  upcomingThisMonth,
  type RecurringExpense,
} from "@/domain/finance/recurring";
import { plural } from "@/lib/ui/text";

/**
 * Регулярные обязательные платежи.
 *
 * Аренда, интернет, абонементы известны заранее. Пока они не записаны,
 * «осталось на день» врёт в большую сторону: деньги как бы есть, но они уже
 * обещаны. Здесь видно, что ещё предстоит заплатить в этом месяце.
 *
 * Платёж НЕ записывается автоматически в день списания: приложение не знает,
 * прошёл он или нет, и придумывать за пользователя расход нельзя. Вместо этого
 * — кнопка «Записать»: одно нажатие превращает обязательство в операцию.
 */

const inputCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

export default function RecurringPage() {
  const { state, financialToday, addRecurring, updateRecurring, deleteRecurring, addTransaction } =
    useStore();
  const toast = useToast();
  const currency = state.mainCurrency ?? "KGS";

  const { upcoming, totalMinor } = useMemo(
    () => upcomingThisMonth(state.recurring, financialToday, currency),
    [state.recurring, financialToday, currency],
  );
  const commitment = useMemo(
    () => monthlyCommitmentMinor(state.recurring, currency),
    [state.recurring, currency],
  );

  const active = state.recurring.filter((r) => r.active);
  const paused = state.recurring.filter((r) => !r.active);

  /** Записать платёж как обычный расход сегодняшним днём. */
  const pay = (item: RecurringExpense) => {
    addTransaction({
      kind: "expense",
      amountMinor: item.amountMinor,
      currency: item.currency,
      category: item.category,
      description: item.title,
    });
    toast.success(`Записал: ${item.title} — ${formatMinor(item.amountMinor, item.currency)}`);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Учёт"
        title="Регулярные расходы"
        subtitle="Аренда, подписки, абонементы — то, что повторяется каждый месяц."
        actions={
          <Link
            href="/finance"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[var(--r-sm)] border border-border px-3 text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> К деньгам
          </Link>
        }
      />

      <RevealList className="grid gap-3 sm:grid-cols-2">
        <RevealItem>
          <Card className="h-full">
            <CardTitle>Обязательства за месяц</CardTitle>
            <p className="mt-3 text-2xl font-extrabold leading-tight">
              {formatMinor(commitment, currency)}
            </p>
            <p className="mt-1 text-[11px] text-muted-2">
              {active.length} {plural(active.length, "платёж", "платежа", "платежей")} в месяц
              {paused.length > 0 && ` · ${paused.length} на паузе`}
            </p>
          </Card>
        </RevealItem>

        <RevealItem>
          <Card className="h-full">
            <CardTitle>Ещё предстоит в этом месяце</CardTitle>
            <p className="mt-3 text-2xl font-extrabold leading-tight">
              {formatMinor(totalMinor, currency)}
            </p>
            <p className="mt-1 text-[11px] text-muted-2">
              {upcoming.length === 0
                ? "Все списания этого месяца уже прошли"
                : `ближайшее — ${formatFinancialDay(upcoming[0].day)}`}
            </p>
          </Card>
        </RevealItem>
      </RevealList>

      <Reveal className="mt-4">
        <AddForm currency={currency} onAdd={addRecurring} />
      </Reveal>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.06em] text-muted">Список</h2>

        {state.recurring.length === 0 ? (
          <EmptyState
            icon={<Repeat className="h-6 w-6" />}
            title="Регулярных платежей пока нет"
            hint="Добавьте аренду, интернет или подписку — и станет видно, сколько денег уже обещано."
          />
        ) : (
          <RevealList className="space-y-2">
            {[...active, ...paused].map((item) => (
              <RevealItem key={item.id}>
                <RecurringRow
                  item={item}
                  currency={currency}
                  dueDay={
                    upcoming.find((u) => u.item.id === item.id)?.day ?? null
                  }
                  onPay={() => pay(item)}
                  onToggle={() => updateRecurring(item.id, { active: !item.active })}
                  onDelete={() => {
                    deleteRecurring(item.id);
                    toast.info(`Удалено: ${item.title}`);
                  }}
                />
              </RevealItem>
            ))}
          </RevealList>
        )}
      </section>
    </div>
  );
}

function RecurringRow({
  item,
  currency,
  dueDay,
  onPay,
  onToggle,
  onDelete,
}: {
  item: RecurringExpense;
  currency: string;
  dueDay: string | null;
  onPay: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-[var(--r)] border border-border/70 bg-surface p-3.5 shadow-soft ${
        item.active ? "" : "opacity-60"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
        <CategoryIcon category={item.category} className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-2">
          <CalendarClock className="h-3 w-3" />
          {item.dayOfMonth}-е число
          {dueDay && ` · ближайшее ${formatFinancialDay(dueDay)}`}
          {!item.active && " · на паузе"}
        </p>
      </div>

      <span className="shrink-0 text-sm font-bold tabular-nums">
        {formatMinor(item.amountMinor, item.currency || currency)}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {item.active && (
          <button
            type="button"
            onClick={onPay}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            <Check className="h-3.5 w-3.5" /> Записать
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={!item.active}
          className="inline-flex min-h-[36px] items-center rounded-lg px-2.5 text-[11px] text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          {item.active ? "Пауза" : "Вернуть"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Удалить регулярный платёж: ${item.title}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AddForm({
  currency,
  onAdd,
}: {
  currency: string;
  onAdd: (input: Omit<RecurringExpense, "id">) => string;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [category, setCategory] = useState<CategoryId>("home");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const amountMinor = parseAmountToMinor(amount);
    const dayOfMonth = Number(day);
    if (!title.trim()) return setError("Назовите платёж — «Аренда», «Интернет».");
    if (amountMinor === null) return setError("Сумма должна быть положительным числом.");
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)
      return setError("День месяца — число от 1 до 31.");

    setError(null);
    onAdd({ title: title.trim(), amountMinor, currency, category, dayOfMonth, active: true });
    toast.success(`Добавлено: ${title.trim()}`);
    setTitle("");
    setAmount("");
  };

  return (
    <Card>
      <CardTitle className="flex items-center gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Новый регулярный платёж
      </CardTitle>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-muted">Название</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Аренда квартиры"
              className={inputCls}
            />
          </label>

          <div className="block">
            <label htmlFor="rec-amount" className="text-xs font-medium text-muted">
              Сумма
            </label>
            <div className="relative">
              <input
                id="rec-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className={`${inputCls} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-2">
                {currencyLabel(currency)}
              </span>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-muted">День месяца</span>
            <input
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-muted">Категория</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryId)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-2 text-[11px] text-muted-2">
          Если в месяце меньше дней, списание переносится на последний день месяца.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-2 text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]"
          >
            {error}
          </p>
        )}

        <div className="mt-3">
          <Button type="submit" size="sm">
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </div>
      </form>
    </Card>
  );
}
