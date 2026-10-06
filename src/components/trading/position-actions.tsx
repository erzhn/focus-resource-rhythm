"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { addExit, moveStop } from "@/lib/trading/actions";
import { formatQuantity } from "@/domain/trading/format";
import type { VolumeUnit } from "@/domain/trading/types";

/**
 * Действия с открытой позицией: частичное закрытие, закрытие остатка,
 * перенос стопа.
 *
 * Перенос стопа меняет только текущий стоп. Исходный и посчитанный от него
 * риск остаются прежними — иначе «перевёл в безубыток» превращало бы любой
 * результат в бесконечный R.
 */

const inputCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PositionActions({
  tradeId,
  remaining,
  volumeUnit,
  needsFx,
  quoteCurrency,
  accountCurrency,
}: {
  tradeId: string;
  remaining: string;
  volumeUnit: VolumeUnit;
  needsFx: boolean;
  quoteCurrency: string;
  accountCurrency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(remaining);
  const [price, setPrice] = useState("");
  const [exitedAt, setExitedAt] = useState(nowLocalInput);
  const [reason, setReason] = useState("");
  const [fxRate, setFxRate] = useState("");

  const [newStop, setNewStop] = useState("");
  const [stopReason, setStopReason] = useState("");

  const submitExit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addExit({ tradeId, quantity, price, exitedAt, reason, fxRate });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.data.closed ? "Позиция закрыта" : "Частичное закрытие записано");
      setPrice("");
      router.refresh();
    });
  };

  const submitStop = () => {
    setError(null);
    startTransition(async () => {
      const result = await moveStop({ tradeId, newStop, reason: stopReason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Стоп перенесён. Исходный риск не изменился");
      setNewStop("");
      setStopReason("");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardTitle>Закрыть</CardTitle>
        <p className="mt-1.5 text-xs text-muted-2">
          Остаток — {formatQuantity(remaining, volumeUnit)}
        </p>

        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitExit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted">Объём</span>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Цена</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className={inputCls}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-muted">Время</span>
            <input
              type="datetime-local"
              value={exitedAt}
              onChange={(e) => setExitedAt(e.target.value)}
              className={inputCls}
            />
          </label>

          {needsFx && (
            <label className="block">
              <span className="text-xs font-medium text-muted">
                Курс {quoteCurrency} → {accountCurrency} на момент выхода
              </span>
              <input
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                inputMode="decimal"
                className={inputCls}
              />
              <span className="mt-1 block text-[11px] text-muted-2">
                Каждый выход конвертируется по своему курсу, а не по курсу входа.
              </span>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted">Причина выхода</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
          </label>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Записываю…" : "Записать выход"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQuantity(remaining)}
              disabled={pending}
            >
              Весь остаток
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardTitle>Перенести стоп</CardTitle>
        <p className="mt-1.5 text-xs text-muted-2">
          Исходный стоп и начальный риск останутся прежними.
        </p>

        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitStop();
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-muted">Новый стоп</span>
            <input
              value={newStop}
              onChange={(e) => setNewStop(e.target.value)}
              inputMode="decimal"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted">Причина</span>
            <input
              value={stopReason}
              onChange={(e) => setStopReason(e.target.value)}
              className={inputCls}
            />
          </label>

          <Button type="submit" size="sm" variant="outline" disabled={pending || !newStop}>
            Перенести
          </Button>
        </form>
      </Card>

      {error && (
        <p
          role="alert"
          className="text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))] sm:col-span-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}
