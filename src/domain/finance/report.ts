import { formatFinancialDay, type FinancialDay } from "./day";
import { formatMinor } from "./format";
import type { BudgetStatus, DaySummary } from "./stats";

/**
 * Текстовые отчёты — для Telegram и для копирования.
 *
 * Здесь эмодзи уместны: это не интерфейс, а обычный текст в мессенджере,
 * где иконок нет и значок несёт смысл.
 */

export interface ReportInput {
  day: FinancialDay;
  today: DaySummary;
  month: DaySummary;
  currency: string;
  dayBudget: BudgetStatus | null;
  balanceMinor: number | null;
}

/** Ежедневный отчёт: доходы, расходы, разбивка, накопительно за месяц. */
export function dailyReport(input: ReportInput): string {
  const { today, month, currency, dayBudget, balanceMinor } = input;
  const m = (v: number) => formatMinor(v, currency);
  const lines: string[] = [];

  lines.push(`📊 ОТЧЁТ ЗА ${formatFinancialDay(input.day).toUpperCase()}`, "");
  lines.push(`Доходы: +${m(today.incomeMinor)}`);
  lines.push(`Расходы: −${m(today.expensesMinor)}`);
  if (today.refundsMinor > 0) lines.push(`Возвраты: +${m(today.refundsMinor)}`);

  if (today.byCategory.length > 0) {
    lines.push("", "По категориям:");
    for (const c of today.byCategory) {
      lines.push(`${c.emoji} ${c.label} — ${m(c.amountMinor)}`);
    }
    lines.push("", `Количество покупок: ${today.count}`);
    const top = today.byCategory[0];
    lines.push(`Самая затратная категория: ${top.label} — ${m(top.amountMinor)}`);
    if (today.largest) {
      lines.push(`Крупнейший расход: ${m(today.largest.amountMinor)} — ${today.largest.description}`);
    }
  } else {
    lines.push("", "Расходов за день не было.");
  }

  if (dayBudget) {
    lines.push(
      "",
      dayBudget.over
        ? `⚠️ Дневной бюджет превышен на ${m(dayBudget.overByMinor)}`
        : `Бюджет: потрачено ${Math.round(dayBudget.ratio * 100)}%, осталось ${m(dayBudget.leftMinor)}`,
    );
  }

  lines.push("", "📈 Накопительно", `Расходы за месяц: ${m(month.expensesMinor)}`);
  if (month.incomeMinor > 0) {
    lines.push(`Доходы за месяц: ${m(month.incomeMinor)}`);
    const diff = month.incomeMinor - month.expensesMinor;
    lines.push(`Разница: ${diff >= 0 ? "+" : "−"}${m(Math.abs(diff))}`);
  }
  if (balanceMinor !== null) lines.push(`Расчётный остаток: ${m(balanceMinor)}`);

  // Валюты, отличные от основной, — отдельной строкой, без пересчёта.
  for (const o of today.otherCurrencies) {
    if (o.expensesMinor > 0) {
      lines.push(`Также потрачено: ${formatMinor(o.expensesMinor, o.currency)}`);
    }
  }

  return lines.join("\n");
}

/** Короткое подтверждение записи — то, что бот отвечает сразу. */
export function confirmation(
  recorded: { amountMinor: number; currency: string; categoryLabel: string | null; emoji: string | null; kind: string }[],
  daySpentMinor: number,
  currency: string,
  dayBudget: BudgetStatus | null,
): string {
  const m = (v: number) => formatMinor(v, currency);
  const lines: string[] = [];

  for (const r of recorded) {
    const what = r.categoryLabel ? `${r.emoji ?? ""} ${r.categoryLabel}`.trim() : r.kind === "income" ? "доход" : "возврат";
    lines.push(`Записал: ${formatMinor(r.amountMinor, r.currency)} — ${what}`);
  }

  lines.push(`Сегодня потрачено: ${m(daySpentMinor)}`);

  if (dayBudget) {
    lines.push(
      dayBudget.over
        ? `⚠️ Дневной бюджет превышен на ${m(dayBudget.overByMinor)}`
        : `Осталось по бюджету: ${m(dayBudget.leftMinor)} (${Math.round(dayBudget.ratio * 100)}%)`,
    );
  }

  return lines.join("\n");
}
