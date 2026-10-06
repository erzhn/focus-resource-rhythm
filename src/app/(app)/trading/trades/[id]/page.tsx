import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { PositionActions } from "@/components/trading/position-actions";
import { Field, Money, Percent, Quantity, RValue } from "@/components/trading/value";
import { getTrade, tradingAvailable } from "@/lib/trading/queries";
import {
  DASH,
  DIRECTION_LABELS,
  ENTRY_MODE_LABELS,
  formatPrice,
  formatQuantity,
} from "@/domain/trading/format";

/**
 * Карточка сделки.
 *
 * Хронология идёт сверху вниз: вход → переносы стопа → выходы → итог. Рядом с
 * числами всегда видно, что известно, а что нет: сделка с неизвестным риском
 * не притворяется посчитанной.
 */

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  if (!tradingAvailable) notFound();

  const { id } = await params;
  const detail = await getTrade(id);
  if (!detail) notFound();

  const { trade, exits, adjustments, events } = detail;
  const currency = trade.account_currency;
  const closed = trade.status === "closed";
  const needsFx = trade.spec_quote_currency.toUpperCase() !== currency.toUpperCase();

  return (
    <div>
      <PageHeader
        eyebrow={`${trade.market_title} · ${trade.instrument_name}`}
        title={`${trade.instrument_code} · ${DIRECTION_LABELS[trade.direction]}`}
        subtitle={`${trade.local_date} · ${trade.account_title}${
          trade.entry_mode !== "planned" ? ` · записана ${ENTRY_MODE_LABELS[trade.entry_mode]}` : ""
        }`}
        actions={
          <Link
            href={`/trading/trades?account=${trade.account_id}`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[var(--r-sm)] border border-border px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> К списку
          </Link>
        }
      />
      <SectionTabs />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardTitle>Вход</CardTitle>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Цена входа">{formatPrice(trade.entry_price)}</Field>
              <Field label="Объём">
                <Quantity value={trade.quantity} unit={trade.spec_volume_unit} />
              </Field>
              <Field label="Исходный стоп" hint="от него считается весь риск">
                {trade.initial_stop ? formatPrice(trade.initial_stop) : DASH}
              </Field>
              <Field label="Текущий стоп">
                {trade.current_stop ? formatPrice(trade.current_stop) : DASH}
              </Field>
              <Field label="Цель">{trade.target ? formatPrice(trade.target) : DASH}</Field>
              <Field label="Плановое R/R">
                <RValue value={trade.planned_rr} reason="Цель не задана" />
              </Field>
              <Field
                label="Риск до стопа"
                hint={trade.initial_risk_account === null ? (trade.unknown_reason ?? undefined) : undefined}
              >
                <Money value={trade.initial_risk_account} currency={currency} tone={false} />
              </Field>
              <Field
                label="Доля от баланса"
                hint={
                  trade.balance_at_entry_source === "unknown"
                    ? "баланс на момент входа не восстанавливался"
                    : undefined
                }
              >
                <Percent value={trade.risk_pct} />
              </Field>
            </div>

            {needsFx && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                Валюта инструмента {trade.spec_quote_currency}, счёт в {currency}. Курс входа:{" "}
                {trade.fx_at_entry ? formatPrice(trade.fx_at_entry) : "не задан"}
                {trade.fx_at_entry_estimated && " (оценка)"}.
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Выходы</CardTitle>
            {exits.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Выходов пока не было.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-2">
                      <th className="pb-2 font-semibold">Время</th>
                      <th className="pb-2 text-right font-semibold">Объём</th>
                      <th className="pb-2 text-right font-semibold">Цена</th>
                      <th className="pb-2 font-semibold">Причина</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exits.map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="py-2 pr-2 text-muted">
                          {new Date(e.exited_at).toISOString().slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatQuantity(e.quantity, trade.spec_volume_unit)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatPrice(e.price)}</td>
                        <td className="py-2 pl-2 text-muted">{e.reason ?? DASH}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {adjustments.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-2">
                  Расходы и свопы
                </p>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {adjustments.map((a) => (
                    <li key={a.id} className="flex justify-between">
                      <span className="text-muted">{a.kind}</span>
                      <Money value={a.amount_account} currency={currency} signed />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {events.length > 0 && (
            <Card>
              <CardTitle>Хронология</CardTitle>
              <ul className="mt-3 space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[11px] tabular-nums text-muted-2">
                      {new Date(e.occurred_at).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                    <span>
                      {e.kind === "stop_moved"
                        ? `Стоп: ${e.from_value ? formatPrice(e.from_value) : DASH} → ${
                            e.to_value ? formatPrice(e.to_value) : DASH
                          }`
                        : e.kind}
                    </span>
                    {e.reason && <span className="text-muted-2">— {e.reason}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!closed && trade.status === "open" && (
            <PositionActions
              tradeId={trade.id}
              remaining={trade.remaining_quantity}
              volumeUnit={trade.spec_volume_unit}
              needsFx={needsFx}
              quoteCurrency={trade.spec_quote_currency}
              accountCurrency={currency}
            />
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardTitle>Итог</CardTitle>
          <div className="mt-3 space-y-3">
            <Field label="Статус">
              {closed ? "закрыта" : `открыта, остаток ${formatQuantity(trade.remaining_quantity, trade.spec_volume_unit)}`}
            </Field>
            <Field label="Чистый результат" hint={trade.unknown_reason ?? undefined}>
              <Money value={trade.net_realized_account} currency={currency} signed />
            </Field>
            <Field label="Валовой результат">
              <Money value={trade.gross_realized_account} currency={currency} signed />
            </Field>
            <Field label="Расходы">
              <Money value={trade.adjustments_account} currency={currency} signed />
            </Field>
            <Field
              label={closed ? "Итоговый R" : "R по закрытой части"}
              hint={
                trade.final_r === null && closed
                  ? (trade.unknown_reason ?? "Исходный риск неизвестен")
                  : undefined
              }
            >
              <RValue value={trade.final_r} reason={trade.unknown_reason} />
            </Field>
            <Field label="Средний выход">
              {trade.avg_exit_price ? formatPrice(trade.avg_exit_price) : DASH}
            </Field>
          </div>

          {trade.notes && (
            <p className="mt-4 border-t border-border pt-3 text-sm text-muted">{trade.notes}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
