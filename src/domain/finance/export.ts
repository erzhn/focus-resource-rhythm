import { CATEGORY_BY_ID } from "./categories";
import type { Transaction } from "./stats";

/**
 * Экспорт операций в CSV.
 *
 * Страховка на случай, если приложение надоест или что-то сломается: данные
 * должны уходить с пользователем. Разделитель — точка с запятой: Excel в
 * русской локали иначе не разбивает строку на колонки.
 */

const SEP = ";";

/** Экранирование по RFC 4180: кавычки удваиваются, поле берётся в кавычки. */
function cell(value: string | number): string {
  const s = String(value);
  return /["\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const KIND_LABEL: Record<Transaction["kind"], string> = {
  expense: "Расход",
  income: "Доход",
  refund: "Возврат",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toCsv(transactions: Transaction[]): string {
  const header = [
    "Финансовый день",
    "Дата и время",
    "Тип",
    "Категория",
    "Описание",
    "Сумма",
    "Валюта",
  ];

  const rows = [...transactions]
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((t) => {
      const d = t.occurredAt;
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      return [
        t.day,
        stamp,
        KIND_LABEL[t.kind],
        t.category ? (CATEGORY_BY_ID.get(t.category)?.label ?? t.category) : "",
        t.description,
        // Десятичная запятая — чтобы Excel в русской локали увидел число.
        (t.amountMinor / 100).toFixed(2).replace(".", ","),
        t.currency,
      ].map(cell).join(SEP);
    });

  // BOM в начале: без него Excel открывает кириллицу как мусор.
  return "﻿" + [header.map(cell).join(SEP), ...rows].join("\r\n");
}

/** Имя файла с диапазоном дат — чтобы выгрузки не перезаписывали друг друга. */
export function csvFileName(transactions: Transaction[]): string {
  if (transactions.length === 0) return "operacii.csv";
  const days = transactions.map((t) => t.day).sort();
  const from = days[0];
  const to = days[days.length - 1];
  return from === to ? `operacii-${from}.csv` : `operacii-${from}_${to}.csv`;
}
