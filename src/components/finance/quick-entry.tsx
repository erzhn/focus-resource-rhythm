"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Plus, TriangleAlert } from "lucide-react";
import { parseEntries, type ParsedEntry } from "@/domain/finance/parse";
import { CATEGORIES, type CategoryId } from "@/domain/finance/categories";
import { formatMinor } from "@/domain/finance/format";
import { Button } from "@/components/ui/primitives";
import { CategoryIcon } from "./category-icon";

/**
 * Быстрый ввод операций.
 *
 * Пользователь пишет как говорит — «Такси 250», «Зарплата 20000», можно
 * несколько строк сразу. Разбор показывается ДО сохранения: видно, что именно
 * запишется, и ничего не происходит молча за спиной.
 *
 * Если категория не распозналась, строка помечается и требует выбора —
 * подставлять «Другое» без спроса нельзя, это искажает статистику.
 */

export interface PendingEntry extends ParsedEntry {
  /** Категория, выбранная вручную, когда автоопределение не сработало. */
  chosen: CategoryId | null;
}

export function QuickEntry({
  onSubmit,
}: {
  onSubmit: (entries: (ParsedEntry & { category: CategoryId | null })[]) => void;
}) {
  const [text, setText] = useState("");
  const [manual, setManual] = useState<Record<number, CategoryId>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { entries, unparsed } = useMemo(() => parseEntries(text), [text]);

  // Строки расходов без категории — их нужно уточнить перед сохранением.
  const needsCategory = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => e.kind === "expense" && !e.category && !manual[i]);

  const canSubmit = entries.length > 0 && needsCategory.length === 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(entries.map((e, i) => ({ ...e, category: e.category ?? manual[i] ?? null })));
    setText("");
    setManual({});
    inputRef.current?.focus();
  };

  return (
    <div className="rounded-[var(--r-lg)] border border-border-strong bg-surface p-4 shadow-soft">
      <label htmlFor="quick-entry" className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
        Быстрая запись
      </label>

      <textarea
        id="quick-entry"
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter сохраняет, Shift+Enter — перенос строки для списка покупок.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={text.includes("\n") ? 4 : 1}
        placeholder="Такси 250"
        aria-describedby="quick-entry-hint"
        className="mt-2 w-full resize-none rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2.5 text-base outline-none transition-colors focus:border-primary"
      />

      <p id="quick-entry-hint" className="mt-1.5 text-[11px] text-muted-2">
        Сумма и категория определяются сами. Enter — записать, Shift+Enter — новая строка.
      </p>

      {/* Предпросмотр: что именно будет записано */}
      <AnimatePresence>
        {entries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 space-y-1.5"
          >
            {entries.map((e, i) => (
              <PreviewRow
                key={i}
                entry={e}
                manualCategory={manual[i]}
                onPick={(c) => setManual((m) => ({ ...m, [i]: c }))}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {unparsed.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Не нашёл сумму: {unparsed.join(" · ")}</span>
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit} disabled={!canSubmit} size="sm">
          <Plus className="h-4 w-4" /> Записать
          {entries.length > 1 ? ` (${entries.length})` : ""}
        </Button>
        {canSubmit && (
          <span className="hidden items-center gap-1 text-[11px] text-muted-2 md:flex">
            <CornerDownLeft className="h-3 w-3" /> Enter
          </span>
        )}
      </div>
    </div>
  );
}

function PreviewRow({
  entry,
  manualCategory,
  onPick,
}: {
  entry: ParsedEntry;
  manualCategory?: CategoryId;
  onPick: (c: CategoryId) => void;
}) {
  const category = entry.category ?? manualCategory ?? null;
  const needsPick = entry.kind === "expense" && !category;

  const kindLabel =
    entry.kind === "income" ? "доход" : entry.kind === "refund" ? "возврат" : null;

  return (
    <div
      className={`rounded-[var(--r-sm)] px-3 py-2 text-sm ${
        needsPick ? "bg-[color-mix(in_oklab,var(--attention)_10%,transparent)]" : "bg-surface-2"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {category && <CategoryIcon category={category} className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{entry.description}</span>
        {kindLabel && (
          <span className="text-[11px] font-semibold text-[var(--resource)]">{kindLabel}</span>
        )}
        <span className="font-bold tabular-nums">
          {entry.kind === "expense" ? "−" : "+"}
          {formatMinor(entry.amountMinor, entry.currency)}
        </span>
      </div>

      {needsPick && (
        <div className="mt-2">
          <p className="mb-1.5 text-[11px] font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]">
            Категория не определилась — выберите:
          </p>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-surface px-2 text-[11px] transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                <CategoryIcon category={c.id} className="h-3.5 w-3.5" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
