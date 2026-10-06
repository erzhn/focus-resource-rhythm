import type { ReactNode } from "react";
import {
  DASH,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatR,
  signOf,
} from "@/domain/trading/format";
import type { VolumeUnit } from "@/domain/trading/types";

/**
 * Показ торговых величин.
 *
 * Два правила, общие для всего модуля:
 *
 * 1. Цвет никогда не единственный носитель смысла — рядом всегда знак или
 *    подпись. Иначе дальтоник и чёрно-белая печать теряют половину данных.
 * 2. Неизвестное выглядит неизвестным: прочерк приглушённым цветом, а не
 *    нейтральный ноль, который читается как измеренный результат.
 */

const toneClass: Record<ReturnType<typeof signOf>, string> = {
  positive: "text-[var(--resource)]",
  negative: "text-[color-mix(in_oklab,var(--danger)_72%,var(--foreground))]",
  zero: "text-foreground",
  unknown: "text-muted-2",
};

export function Money({
  value,
  currency,
  signed = false,
  maxFraction,
  className = "",
  tone = true,
}: {
  value: string | null | undefined;
  currency: string;
  signed?: boolean;
  maxFraction?: number;
  className?: string;
  /** Красить по знаку: для результата — да, для баланса — нет. */
  tone?: boolean;
}) {
  const sign = signOf(value);
  return (
    <span className={`tabular-nums ${tone ? toneClass[sign] : ""} ${className}`}>
      {formatMoney(value, currency, { signed, maxFraction })}
    </span>
  );
}

export function RValue({
  value,
  className = "",
  reason,
}: {
  value: string | null | undefined;
  className?: string;
  /** Почему значение неизвестно — показывается подсказкой. */
  reason?: string | null;
}) {
  const sign = signOf(value);
  const text = formatR(value);
  return (
    <span
      className={`tabular-nums ${toneClass[sign]} ${className}`}
      title={value === null || value === undefined ? (reason ?? "Значение неизвестно") : undefined}
    >
      {text}
    </span>
  );
}

export function Percent({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatPercent(value)}</span>;
}

export function Quantity({
  value,
  unit,
  className = "",
}: {
  value: string | null | undefined;
  unit: VolumeUnit;
  className?: string;
}) {
  return <span className={`tabular-nums ${className}`}>{formatQuantity(value, unit)}</span>;
}

/**
 * Пара «подпись — значение» с необязательным пояснением.
 * Пояснение обязательно, когда значение неизвестно: пустая клетка без причины
 * выглядит ошибкой приложения.
 */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-2">{label}</p>
      <div className="mt-0.5 text-sm font-semibold">{children}</div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-2">{hint}</p>}
    </div>
  );
}

/** Прочерк с объяснением — для мест, где значения нет и это нормально. */
export function Unknown({ reason }: { reason?: string | null }) {
  return (
    <span className="text-muted-2" title={reason ?? undefined}>
      {DASH}
    </span>
  );
}
