"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Download, Trash2, Wallet } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Reveal, RevealList, RevealItem } from "@/components/ui/reveal";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { useToast } from "@/components/ui/toast";
import { QuickEntry } from "@/components/finance/quick-entry";
import { CategoryIcon, categoryFill } from "@/components/finance/category-icon";
import { formatFinancialDay, shiftFinancialDay } from "@/domain/finance/day";
import { budgetStatus, computeBalance, summarizeDay, summarizeMonth } from "@/domain/finance/stats";
import { currencyLabel, formatMinor, formatMinorShort } from "@/domain/finance/format";
import { CATEGORY_BY_ID } from "@/domain/finance/categories";
import { csvFileName, toCsv } from "@/domain/finance/export";
import type { DemoTransaction } from "@/lib/demo/types";

export default function FinancePage() {
  const store = useStore();
  const { state, financialToday, addTransaction, deleteTransaction } = store;
  const toast = useToast();
  const [day, setDay] = useState(financialToday);

  const currency = state.mainCurrency ?? "KGS";
  const txs = useMemo(
    () =>
      state.transactions.map((t) => ({ ...t, occurredAt: new Date(t.occurredAt) })),
    [state.transactions],
  );

  const today = useMemo(() => summarizeDay(txs, day, currency), [txs, day, currency]);
  const month = useMemo(() => summarizeMonth(txs, day, currency), [txs, day, currency]);
  const dayBudget = budgetStatus(today.expensesMinor, state.dailyBudgetMinor);
  const monthBudget = budgetStatus(month.expensesMinor, state.monthlyBudgetMinor);
  const balance = computeBalance(txs, state.openingBalanceMinor, currency);

  const dayTxs = txs
    .filter((t) => t.day === day)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const isToday = day === financialToday;

  const handleAdd = (
    entries: {
      kind: DemoTransaction["kind"];
      amountMinor: number;
      currency: string;
      description: string;
      category: DemoTransaction["category"];
    }[],
  ) => {
    entries.forEach((e) =>
      addTransaction({
        kind: e.kind,
        amountMinor: e.amountMinor,
        currency: e.currency,
        category: e.category,
        description: e.description,
      }),
    );
    const total = entries.reduce((s, e) => s + (e.kind === "expense" ? e.amountMinor : 0), 0);
    toast.success(
      entries.length === 1
        ? `Записал: ${formatMinor(entries[0].amountMinor, entries[0].currency)}`
        : `Записал ${entries.length} операции на ${formatMinor(total, currency)}`,
    );
  };

  /** Выгрузка всех операций: страховка на случай, если данные понадобятся вне приложения. */
  const exportCsv = () => {
    const csv = toCsv(txs);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(txs);
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Выгружено операций: ${txs.length}`);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Учёт"
        title="Деньги"
        subtitle={`Финансовый день начинается в 01:00 · ${formatFinancialDay(day)}`}
        actions={
          <div className="flex items-center gap-1 rounded-[var(--r)] bg-surface-2 p-1">
            <button
              onClick={() => setDay((d) => shiftFinancialDay(d, -1))}
              className="inline-flex h-9 items-center rounded-[var(--r-sm)] px-3 text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              ← Вчера
            </button>
            <button
              onClick={() => setDay(financialToday)}
              disabled={isToday}
              className={`inline-flex h-9 items-center rounded-[var(--r-sm)] px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${
                isToday ? "bg-primary text-primary-fg shadow-primary" : "text-muted hover:text-foreground"
              }`}
            >
              Сегодня
            </button>
            <button
              onClick={() => setDay((d) => shiftFinancialDay(d, 1))}
              disabled={isToday}
              className="inline-flex h-9 items-center rounded-[var(--r-sm)] px-3 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              Завтра →
            </button>
            <Button size="sm" variant="ghost" onClick={exportCsv} disabled={txs.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        }
      />

      {isToday && (
        <Reveal className="mb-4">
          <QuickEntry onSubmit={handleAdd} />
        </Reveal>
      )}

      {/* Сводка дня */}
      <RevealList className="grid gap-3 sm:grid-cols-3">
        <RevealItem>
          <Card className="h-full">
            <CardTitle>Расходы за день</CardTitle>
            <div className="mt-3 flex items-center gap-4">
              {dayBudget ? (
                <ProgressRing
                  value={Math.min(1, dayBudget.ratio)}
                  size={64}
                  stroke={7}
                  color={dayBudget.over ? "var(--attention)" : "var(--primary)"}
                  label={`Использовано ${Math.round(dayBudget.ratio * 100)}% дневного бюджета`}
                >
                  <span className="text-xs font-bold">{Math.round(dayBudget.ratio * 100)}%</span>
                </ProgressRing>
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] text-primary">
                  <ArrowDownRight className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-2xl font-extrabold leading-tight">
                  <AnimatedNumber
                    value={today.expensesMinor / 100}
                    format={(n) => formatMinorShort(Math.round(n) * 100)}
                  />{" "}
                  <span className="text-base font-bold text-muted-2">{currencyLabel(currency)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-2">
                  {today.count} {plural(today.count, "покупка", "покупки", "покупок")}
                  {today.refundsMinor > 0 && ` · возвращено ${formatMinor(today.refundsMinor, currency)}`}
                </p>
              </div>
            </div>
            {dayBudget && (
              <p
                className={`mt-3 text-xs font-medium ${
                  dayBudget.over
                    ? "text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]"
                    : "text-muted"
                }`}
              >
                {dayBudget.over
                  ? `Дневной бюджет превышен на ${formatMinor(dayBudget.overByMinor, currency)}`
                  : `Осталось ${formatMinor(dayBudget.leftMinor, currency)} из ${formatMinor(dayBudget.limitMinor, currency)}`}
              </p>
            )}
          </Card>
        </RevealItem>

        <RevealItem>
          <Card className="h-full">
            <CardTitle>Доходы за день</CardTitle>
            <div className="mt-3 flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--resource)_16%,transparent)] text-[var(--resource)]">
                <ArrowUpRight className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-extrabold leading-tight">
                  {formatMinor(today.incomeMinor, currency)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-2">
                  За месяц: {formatMinor(month.incomeMinor, currency)}
                </p>
              </div>
            </div>
          </Card>
        </RevealItem>

        <RevealItem>
          <Card className="h-full">
            <CardTitle>{balance === null ? "Месяц" : "Баланс"}</CardTitle>
            <div className="mt-3 flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-3 text-muted">
                <Wallet className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                {balance === null ? (
                  <>
                    <p className="text-2xl font-extrabold leading-tight">
                      {formatMinor(month.expensesMinor, currency)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-2">расходы за месяц</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-extrabold leading-tight">
                      {formatMinor(balance, currency)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-2">
                      расчётный остаток
                    </p>
                  </>
                )}
              </div>
            </div>
            {monthBudget?.over && (
              <p className="mt-3 text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]">
                Месячный бюджет превышен на {formatMinor(monthBudget.overByMinor, currency)}
              </p>
            )}
          </Card>
        </RevealItem>
      </RevealList>

      {/* Категории */}
      {today.byCategory.length > 0 && (
        <Reveal className="mt-4">
          <Card>
            <CardTitle>По категориям</CardTitle>
            <div className="mt-3 space-y-2.5">
              {today.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center gap-2 text-sm">
                    <CategoryIcon category={c.category} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <span className="text-[11px] text-muted-2">{Math.round(c.share * 100)}%</span>
                    <span className="font-bold tabular-nums">
                      {formatMinor(c.amountMinor, currency)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className="h-full w-full origin-left rounded-full"
                      style={{ backgroundColor: categoryFill(c.category) }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: c.share }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* Месяц целиком */}
      {month.byCategory.length > 0 && (
        <Reveal className="mt-4">
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle>Месяц по категориям</CardTitle>
              <span className="text-xs text-muted-2">
                расходы {formatMinor(month.expensesMinor, currency)}
                {month.incomeMinor > 0 && ` · доходы ${formatMinor(month.incomeMinor, currency)}`}
              </span>
            </div>
            <div className="mt-3 space-y-2.5">
              {month.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center gap-2 text-sm">
                    <CategoryIcon category={c.category} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <span className="text-[11px] text-muted-2">
                      {c.count} {c.count === 1 ? "операция" : "опер."}
                    </span>
                    <span className="font-bold tabular-nums">
                      {formatMinor(c.amountMinor, currency)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className="h-full w-full origin-left rounded-full"
                      style={{ backgroundColor: categoryFill(c.category) }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: c.share }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {month.incomeMinor > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-sm">
                Разница доходов и расходов:{" "}
                <span
                  className={`font-bold ${
                    month.incomeMinor >= month.expensesMinor
                      ? "text-[var(--resource)]"
                      : "text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]"
                  }`}
                >
                  {month.incomeMinor >= month.expensesMinor ? "+" : "−"}
                  {formatMinor(Math.abs(month.incomeMinor - month.expensesMinor), currency)}
                </span>
              </p>
            )}
          </Card>
        </Reveal>
      )}

      {/* Операции дня */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.06em] text-muted">
          Операции за {formatFinancialDay(day)}
        </h2>
        {dayTxs.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="Операций пока нет"
            hint={isToday ? "Напишите «Такси 250» в поле выше — остальное определится само." : "В этот день записей не было."}
          />
        ) : (
          <RevealList className="space-y-2">
            <AnimatePresence initial={false}>
              {dayTxs.map((t) => (
                <RevealItem key={t.id}>
                  <TxRow
                    tx={t}
                    currency={currency}
                    onDelete={() => {
                      deleteTransaction(t.id);
                      toast.info(`Удалено: ${t.description}`);
                    }}
                  />
                </RevealItem>
              ))}
            </AnimatePresence>
          </RevealList>
        )}
      </section>
    </div>
  );
}

function TxRow({
  tx,
  currency,
  onDelete,
}: {
  tx: DemoTransaction;
  currency: string;
  onDelete: () => void;
}) {
  const isExpense = tx.kind === "expense";
  const meta = tx.category ? CATEGORY_BY_ID.get(tx.category) : null;
  const time = new Date(tx.occurredAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="group flex items-center gap-3 rounded-[var(--r)] border border-border/70 bg-surface p-3.5 shadow-soft">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
        {tx.category ? (
          <CategoryIcon category={tx.category} className="h-4 w-4" />
        ) : isExpense ? (
          <ArrowDownRight className="h-4 w-4 text-muted" />
        ) : (
          <ArrowUpRight className="h-4 w-4 text-[var(--resource)]" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.description}</p>
        <p className="text-[11px] text-muted-2">
          {time}
          {meta && ` · ${meta.label}`}
          {tx.kind === "refund" && " · возврат"}
          {tx.kind === "income" && " · доход"}
        </p>
      </div>

      <span
        className={`shrink-0 text-sm font-bold tabular-nums ${
          isExpense ? "" : "text-[var(--resource)]"
        }`}
      >
        {isExpense ? "−" : "+"}
        {formatMinor(tx.amountMinor, tx.currency || currency)}
      </span>

      <button
        onClick={onDelete}
        aria-label={`Удалить операцию: ${tx.description}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-2 opacity-0 transition-opacity hover:bg-surface-2 hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] group-hover:opacity-100 md:opacity-0"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
