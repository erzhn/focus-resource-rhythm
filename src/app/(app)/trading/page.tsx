import Link from "next/link";
import dynamicImport from "next/dynamic";
import { ArrowRight, LineChart, Plus, Target, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle, EmptyState, Button } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { Money } from "@/components/trading/value";
import { listAccounts, listOpenTrades, listTrades, tradingAvailable } from "@/lib/trading/queries";
import { TradeRowCard } from "@/components/trading/trade-row-card";
import { loadAnalytics, periodRange } from "@/lib/trading/analytics-data";
import { drawdown, equityCurve, observations } from "@/domain/trading/analytics";
import { round, toTrimmedString } from "@/domain/trading/decimal";

const EquityCurve = dynamicImport(() =>
  import("@/components/trading/charts").then((m) => m.EquityCurve),
);

/**
 * Обзор счёта.
 *
 * Первый экран отвечает на четыре вопроса: сколько денег, что открыто, что
 * получилось и чего не хватает в данных. Остальные показатели — на аналитике:
 * десять диаграмм на входе не помогают принимать решения.
 */

export default async function TradingOverview({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  if (!tradingAvailable) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Журнал сделок" />
        <EmptyState
          icon={<LineChart className="h-6 w-6" />}
          title="Нужна база данных"
          hint="Модуль хранит сделки в PostgreSQL с изоляцией по владельцу. В демо-режиме он недоступен."
        />
      </div>
    );
  }

  const accounts = await listAccounts();
  const { account: requested } = await searchParams;
  const account = accounts.find((a) => a.id === requested) ?? accounts[0] ?? null;

  if (!account) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Журнал сделок" />
        <SectionTabs />
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Счёта пока нет"
          hint="Создайте счёт: название, валюта, начальный баланс и часовой пояс — с них начинается учёт."
          action={
            <Link href="/trading/accounts">
              <Button size="sm">
                <Plus className="h-4 w-4" /> Создать счёт
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const [open, recent, analytics] = await Promise.all([
    listOpenTrades(account.id),
    listTrades({ accountId: account.id, status: "closed" }, 1, 5),
    loadAnalytics(account.id, account.currency),
  ]);

  // Обзор показывает последние три месяца: на первом экране нужен не весь
  // архив, а то, что происходит сейчас.
  const { from, to } = periodRange(90);
  const curve = equityCurve(analytics.postings.filter((p) => p.at >= from && p.at <= to));
  const dd = drawdown(curve);
  const focus = observations(
    analytics.trades.filter((t) => t.closedAt && t.closedAt >= from && t.closedAt <= to),
  )[0];

  return (
    <div>
      <PageHeader
        eyebrow="Торговля"
        title={account.title}
        subtitle={`${account.currency} · ${account.timezone}${account.is_demo ? " · демосчёт" : ""}`}
        actions={
          <Link href={`/trading/new?account=${account.id}`}>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Добавить сделку
            </Button>
          </Link>
        }
      />
      <SectionTabs />

      {account.is_demo && (
        <Card className="mb-4 border-[var(--warning)]/40 bg-[var(--warning)]/10">
          <p className="text-sm text-[color-mix(in_oklab,var(--warning)_58%,var(--foreground))]">
            Это демосчёт. Его сделки не попадают в аналитику боевых счетов.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Учётный баланс" hint="капитал журнала, а не свободные средства у брокера">
          <Money value={account.book_balance} currency={account.currency} tone={false} />
        </Stat>
        <Stat label="Торговый результат" hint="без пополнений и выводов">
          <Money value={account.cumulative_trading_pnl} currency={account.currency} signed />
        </Stat>
        <Stat label="Внешние потоки" hint="пополнения минус выводы">
          <Money value={account.net_cash_flow} currency={account.currency} tone={false} />
        </Stat>
        <Stat
          label="Сделок"
          hint={
            account.unknown_result_trades > 0
              ? `${account.unknown_result_trades} с неизвестным результатом`
              : "открытых / закрытых"
          }
        >
          <span className="tabular-nums">
            {account.open_trades} / {account.closed_trades}
          </span>
        </Stat>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle>Накопленный результат за 90 дней</CardTitle>
            <Link
              href={`/trading/analytics?account=${account.id}`}
              className="text-xs text-primary hover:underline"
            >
              Аналитика →
            </Link>
          </div>
          <div className="mt-3 h-56">
            {curve.length === 0 ? (
              <p className="text-sm text-muted">
                Денежных проводок за последние 90 дней не было.
              </p>
            ) : (
              <EquityCurve
                currency={account.currency}
                data={curve.map((p) => ({
                  label: p.at.toISOString().slice(5, 10),
                  value: Number(toTrimmedString(round(p.cumulative, 2))),
                }))}
              />
            )}
          </div>
          {curve.length > 0 && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
              Денежная просадка от максимума:{" "}
              <Money value={toTrimmedString(dd.max)} currency={account.currency} tone={false} />.
              Пополнения и выводы в эту кривую не входят.
            </p>
          )}
        </Card>

        <Card className="h-fit">
          <CardTitle className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Фокус
          </CardTitle>
          {focus ? (
            <>
              <p className="mt-3 text-sm font-medium">{focus.title}</p>
              <p className="mt-1 text-xs text-muted-2">{focus.basis}</p>
              <Link
                href={`/trading/trades?account=${account.id}&status=closed`}
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                Показать сделки
              </Link>
              <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-2">
                Это описание данных, а не вывод о причинах.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Проверяемых наблюдений за 90 дней нет: данных либо достаточно, либо ещё слишком мало.
            </p>
          )}
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.06em] text-muted">
          Открытые позиции
        </h2>
        {open.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Открытых позиций нет.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {open.map((t) => (
              <TradeRowCard key={t.id} trade={t} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-muted">
            Последние закрытые
          </h2>
          <Link
            href={`/trading/trades?account=${account.id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Все сделки <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recent.rows.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Закрытых сделок пока нет.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.rows.map((t) => (
              <TradeRowCard key={t.id} trade={t} />
            ))}
          </div>
        )}
      </section>

      {accounts.length > 1 && (
        <section className="mt-6">
          <CardTitle>Другие счета</CardTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            {accounts
              .filter((a) => a.id !== account.id)
              .map((a) => (
                <Link
                  key={a.id}
                  href={`/trading?account=${a.id}`}
                  className="inline-flex min-h-[36px] items-center gap-2 rounded-[var(--r-sm)] border border-border px-3 text-xs transition-colors hover:bg-surface-2"
                >
                  {a.title}
                  <Money value={a.book_balance} currency={a.currency} tone={false} />
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2">{label}</p>
      <p className="mt-2 text-xl font-extrabold leading-tight">{children}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-2">{hint}</p>}
    </Card>
  );
}

/** Страница зависит от сессии и фильтров — отдаём её по запросу, не из кэша. */
export const dynamic = "force-dynamic";
