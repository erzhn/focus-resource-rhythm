"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Trash2, X } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";
import { CategoryIcon } from "./category-icon";
import { CATEGORIES, type CategoryId, type TxKind } from "@/domain/finance/categories";
import { currencyLabel, formatMinor, parseAmountToMinor } from "@/domain/finance/format";
import {
  financialDayOf,
  formatFinancialDay,
  fromLocalInput,
  toLocalInput,
} from "@/domain/finance/day";
import type { DemoTransaction } from "@/lib/demo/types";

/**
 * Правка записанной операции.
 *
 * Раньше ошибку можно было только удалить и записать заново. При быстром вводе
 * это самая частая нужда, и терять исходное время записи было неправильно.
 *
 * Ничего не меняется молча: если новое время уводит операцию в соседний
 * финансовый день, об этом сказано до сохранения. Категория у расхода
 * обязательна — «Другое» за пользователя не подставляется, иначе статистика
 * показывает не то, что было.
 */

const KIND_LABELS: Record<TxKind, string> = {
  expense: "Расход",
  income: "Доход",
  refund: "Возврат",
};

const inputCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

export type TransactionPatch = Partial<Omit<DemoTransaction, "id">>;

export function TransactionEdit({
  tx,
  onSave,
  onDelete,
  onClose,
}: {
  tx: DemoTransaction;
  onSave: (patch: TransactionPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const [description, setDescription] = useState(tx.description);
  const [amount, setAmount] = useState(String(tx.amountMinor / 100));
  const [kind, setKind] = useState<TxKind>(tx.kind);
  const [category, setCategory] = useState<CategoryId | null>(tx.category);
  const [at, setAt] = useState(() => toLocalInput(new Date(tx.occurredAt)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountMinor = parseAmountToMinor(amount);
  const occurredAt = fromLocalInput(at);
  const newDay = occurredAt ? financialDayOf(occurredAt) : tx.day;
  const movesDay = newDay !== tx.day;

  const save = () => {
    if (!description.trim()) return setError("Опишите операцию — по пустой строке её потом не найти.");
    if (amountMinor === null) return setError("Сумма должна быть положительным числом.");
    if (!occurredAt) return setError("Время указано неверно.");
    if (kind === "expense" && !category) return setError("Выберите категорию расхода.");

    setError(null);
    onSave({
      description: description.trim(),
      amountMinor,
      kind,
      // Категория есть только у расхода: у дохода и возврата её нет по смыслу.
      category: kind === "expense" ? category : null,
      occurredAt,
      day: financialDayOf(occurredAt),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <motion.div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Правка операции"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
        className="w-full max-w-md"
      >
        <Card className="max-h-[92vh] w-full overflow-y-auto rounded-b-none md:rounded-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Правка операции</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="rounded-lg p-1 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="text-xs font-medium text-muted">Описание</span>
              <input
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              {/* Подпись валюты вынесена из <label>: внутри него она попадала
                  в доступное имя поля — «Сумма сом». */}
              <div className="block">
                <label htmlFor="tx-amount" className="text-xs font-medium text-muted">
                  Сумма
                </label>
                <div className="relative">
                  <input
                    id="tx-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    className={`${inputCls} pr-12`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-2">
                    {currencyLabel(tx.currency)}
                  </span>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-muted">Когда</span>
                <input
                  type="datetime-local"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>

            <div>
              <span className="text-xs font-medium text-muted">Тип</span>
              <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Тип операции">
                {(Object.keys(KIND_LABELS) as TxKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={`min-h-[36px] flex-1 rounded-lg border px-2 text-xs transition-colors ${
                      kind === k
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-border hover:bg-surface-2"
                    }`}
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            {kind === "expense" && (
              <div>
                <span className="text-xs font-medium text-muted">Категория</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                      className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors ${
                        category === c.id
                          ? "border-primary bg-[var(--primary-soft)] text-primary"
                          : "border-border hover:bg-surface-2"
                      }`}
                    >
                      <CategoryIcon category={c.id} className="h-3.5 w-3.5" />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {movesDay && (
              <p className="text-xs text-[color-mix(in_oklab,var(--warning)_58%,var(--foreground))]">
                Операция переедет в другой финансовый день — {formatFinancialDay(newDay)}.
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {confirmDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--danger)] px-3 text-xs font-medium text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Точно удалить?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs text-muted transition-colors hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Удалить
                </button>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Отмена
                </Button>
                <Button type="submit" size="sm">
                  Сохранить
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-muted-2">
              Было: {tx.kind === "expense" ? "−" : "+"}
              {formatMinor(tx.amountMinor, tx.currency)} ·{" "}
              {toLocalInput(new Date(tx.occurredAt)).slice(11)}
            </p>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
