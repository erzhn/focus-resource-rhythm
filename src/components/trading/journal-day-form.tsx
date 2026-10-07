"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { saveJournalDay } from "@/lib/trading/actions";
import { Money } from "./value";
import { toTrimmedString } from "@/domain/trading/decimal";
import { formatLocalDate } from "@/domain/trading/day";
import type { JournalDay } from "@/lib/trading/journal";

/**
 * Запись одного дня.
 *
 * Утренняя часть и вечерний итог разделены сознательно: заполненный утром
 * план не означает, что день разобран. Напоминание о разборе ориентируется
 * именно на отметку итога.
 */

const inputCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

export function JournalDayForm({
  accountId,
  day,
  currency,
}: {
  accountId: string;
  day: JournalDay;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState(day.plan ?? "");
  const [mood, setMood] = useState(day.mood ?? "");
  const [outcome, setOutcome] = useState(day.outcome ?? "");
  const [lesson, setLesson] = useState(day.lesson ?? "");
  const [isDayOff, setIsDayOff] = useState(day.isDayOff);

  const save = (completeEvening: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await saveJournalDay({
        accountId,
        date: day.date,
        plan,
        mood,
        outcome,
        lesson,
        isDayOff,
        completeEvening: completeEvening || day.eveningDone,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(completeEvening ? "День разобран" : "Запись сохранена");
      router.refresh();
    });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>{formatLocalDate(day.date)}</CardTitle>
        <span className="text-xs text-muted-2">
          {day.trades === 0
            ? "сделок не было"
            : `${day.trades} ${day.trades === 1 ? "сделка" : "сделок"}`}
          {day.net !== null && (
            <>
              {" · "}
              <Money value={toTrimmedString(day.net)} currency={currency} signed />
            </>
          )}
          {day.hasOpen && " · есть открытые позиции"}
          {day.unknownResult && " · итог части сделок неизвестен"}
        </span>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <label className="block">
          <span className="text-xs font-medium text-muted">План на сессию</span>
          <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} className={inputCls} />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Состояние</span>
          <textarea value={mood} onChange={(e) => setMood(e.target.value)} rows={3} className={inputCls} />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Итог дня</span>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Один урок</span>
          <textarea
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={isDayOff}
            onChange={(e) => setIsDayOff(e.target.checked)}
            disabled={day.trades > 0}
          />
          Запланированный выходной
          {day.trades > 0 && (
            <span className="text-[11px] text-muted-2">— в этот день были сделки</span>
          )}
        </label>

        {error && (
          <p
            role="alert"
            className="text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))] sm:col-span-2"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Сохранить
          </Button>
          {!day.eveningDone && (
            <Button type="button" size="sm" onClick={() => save(true)} disabled={pending}>
              <CheckCircle2 className="h-4 w-4" /> Разбор завершён
            </Button>
          )}
          {day.eveningDone && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--resource)]">
              <CheckCircle2 className="h-3.5 w-3.5" /> разбор завершён
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
