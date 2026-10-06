import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Money, RValue } from "./value";
import { DIRECTION_LABELS, ENTRY_MODE_LABELS, formatPrice, formatQuantity } from "@/domain/trading/format";
import type { TradeRow } from "@/lib/trading/mappers";

/**
 * Строка сделки в списке.
 *
 * Результат и соблюдение правил показываются рядом, но не сливаются: прибыль
 * не делает сделку правильной, а убыток — ошибкой. Поэтому цвет относится к
 * деньгам, а пометки о неполноте данных стоят отдельной подписью.
 *
 * На телефоне это карточка, а не сжатая строка широкой таблицы: в таблице
 * пришлось бы прокручивать вбок ради самого важного числа.
 */
export function TradeRowCard({ trade }: { trade: TradeRow }) {
  const isLong = trade.direction === "long";
  const closed = trade.status === "closed";

  return (
    <Link
      href={`/trading/trades/${trade.id}`}
      className="flex flex-wrap items-center gap-3 rounded-[var(--r)] border border-border/70 bg-surface p-3.5 shadow-soft transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          isLong ? "bg-[color-mix(in_oklab,var(--resource)_14%,transparent)]" : "bg-surface-2"
        }`}
        aria-hidden
      >
        {isLong ? (
          <ArrowUpRight className="h-4 w-4 text-[var(--resource)]" />
        ) : (
          <ArrowDownRight className="h-4 w-4 text-muted" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {trade.instrument_code}
          <span className="ml-1.5 font-normal text-muted-2">{DIRECTION_LABELS[trade.direction]}</span>
        </p>
        <p className="text-[11px] text-muted-2">
          {trade.local_date} · {formatQuantity(trade.quantity, trade.spec_volume_unit)} ·{" "}
          {formatPrice(trade.entry_price)}
          {trade.entry_mode !== "planned" && ` · ${ENTRY_MODE_LABELS[trade.entry_mode]}`}
          {!closed && ` · остаток ${formatQuantity(trade.remaining_quantity, trade.spec_volume_unit)}`}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold">
          {closed ? (
            <Money value={trade.net_realized_account} currency={trade.account_currency} signed />
          ) : (
            <span className="text-xs font-medium text-muted">открыта</span>
          )}
        </p>
        <p className="text-[11px]">
          <RValue value={closed ? trade.final_r : null} reason={trade.unknown_reason} />
        </p>
      </div>
    </Link>
  );
}
