import Link from "next/link";
import dynamicImport from "next/dynamic";
import { BarChart3, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { Money, RValue } from "@/components/trading/value";
import { listAccounts, tradingAvailable } from "@/lib/trading/queries";
import { loadAnalytics, periodRange, previousRange } from "@/lib/trading/analytics-data";
import {
  closedStats,
  compareToPrevious,
  drawdown,
  equityCurve,
  groupStats,
  observations,
  rDistribution,
  realizedInPeriod,
} from "@/domain/trading/analytics";
import { toTrimmedString, round, type Decimal } from "@/domain/trading/decimal";
import { DASH, DIRECTION_LABELS, formatPercent, formatR } from "@/domain/trading/format";
import type { Maybe } from "@/domain/trading/types";

const EquityCurve = dynamicImport(() => import("@/components/trading/charts").then((m) => m.EquityCurve));
const RHistogram = dynamicImport(() => import("@/components/trading/charts").then((m) => m.RHistogram));

/**
 * Аналитика.
 *
 * Рядом с каждым показателем стоит, на чём он посчитан: период, число
 * наблюдений и полнота данных. Показатель без этого контекста выглядит
 * надёжнее, чем он есть, и именно так аналитика начинает врать.
 */

const PERIODS = [
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
  { days: 365, label: "год" },
  { days: null, label: "всё время" },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; days?: string }>;
}) {
  if (!tradingAvailable) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Аналитика" />
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Модуль работает только с базой" />
      </div>
    );
  }

  const accounts = await listAccounts();
  const params = await searchParams;
  const account = accounts.find((a) => a.id === params.account) ?? accounts[0] ?? null;

  if (!account) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Аналитика" />
        <SectionTabs />
        <EmptyState title="Счёта пока нет" hint="Создайте счёт на вкладке «Счета»." />
      </div>
    );
  }

  const days = params.days === "all" ? null : Number(params.days ?? "90") || 90;
  const { from, to } = periodRange(days);
  const data = await loadAnalytics(account.id, account.currency);

  const inPeriod = data.trades.filter(
    (t) => t.closedAt && t.closedAt >= from && t.closedAt <= to,
  );
  const openNow = data.trades.filter((t) => t.status === "open");

  const stats = closedStats(inPeriod);
  const realized = realizedInPeriod(data.postings, from, to);
  const curve = equityCurve(data.postings.filter((p) => p.at >= from && p.at <= to));
  const dd = drawdown(curve);
  const distribution = rDistribution(inPeriod);

  const previous = days === null ? null : previousRange(days);
  const previousRealized = previous
    ? realizedInPeriod(data.postings, previous.from, previous.to)
    : null;
  const change = previousRealized ? compareToPrevious(realized, previousRealized) : null;

  const byInstrument = groupStats(inPeriod, (t) => ({ key: t.instrumentCode, label: t.instrumentCode }));
  const byMarket = groupStats(inPeriod, (t) => ({ key: t.marketCode, label: t.marketCode }));
  const byDirection = groupStats(inPeriod, (t) => ({
    key: t.direction,
    label: DIRECTION_LABELS[t.direction],
  }));
  const byWeekday = groupStats(inPeriod, (t) => {
    const names = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
    const index = new Date(t.localDate).getUTCDay();
    return { key: String(index), label: names[index] };
  });

  const notes = observations(inPeriod);
  const tradesLink = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ account: account.id, status: "closed", ...patch });
    return `/trading/trades?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Торговля"
        title="Аналитика"
        subtitle={`${account.title} · ${inPeriod.length} закрытых сделок за период`}
      />
      <SectionTabs />

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Период">
        {PERIODS.map((p) => {
          const value = p.days === null ? "all" : String(p.days);
          const active = (params.days ?? "90") === value || (!params.days && p.days === 90);
          return (
            <Link
              key={p.label}
              href={`/trading/analytics?account=${account.id}&days=${value}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-[var(--r-sm)] px-3 text-xs font-medium transition-colors ${
                active ? "bg-primary text-primary-fg" : "border border-border text-muted hover:bg-surface-2"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>

      {data.truncated && (
        <Card className="mb-4 border-[var(--warning)]/40 bg-[var(--warning)]/10">
          <p className="text-sm text-[color-mix(in_oklab,var(--warning)_58%,var(--foreground))]">
            Показаны последние 2000 сделок: статистика посчитана по ним, а не по всей истории.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Результат за период"
          hint={
            change
              ? change.known
                ? `к прошлому периоду ${formatPercent(toTrimmedString(change.value))}`
                : change.reason
              : "по денежным проводкам"
          }
        >
          <Money value={toTrimmedString(realized)} currency={account.currency} signed />
        </Stat>

        <Stat label="Доля выигрышей" hint={`${stats.wins} из ${stats.count - stats.unknownNet} с известным итогом`}>
          <MaybeValue value={stats.winRate} render={(v) => formatPercent(toTrimmedString(round(v, 2)))} />
        </Stat>

        <Stat label="Профит-фактор" hint={`прибыли / убытки`}>
          <MaybeValue value={stats.profitFactor} render={(v) => toTrimmedString(round(v, 2))} />
        </Stat>

        <Stat
          label="Средний R"
          hint={stats.unknownR > 0 ? `без R: ${stats.unknownR} сделок` : `по ${stats.knownR} сделкам`}
        >
          <MaybeValue value={stats.avgR} render={(v) => formatR(toTrimmedString(v))} />
        </Stat>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle>Накопленный результат</CardTitle>
            <span className="text-[11px] text-muted-2">
              по проводкам выходов и расходов · {curve.length} точек
            </span>
          </div>
          <div className="mt-3 h-64">
            {curve.length === 0 ? (
              <p className="text-sm text-muted">За период не было ни одной денежной проводки.</p>
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
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            Денежная просадка от максимума: <Money value={toTrimmedString(dd.max)} currency={account.currency} tone={false} />
            {" · "}сейчас <Money value={toTrimmedString(dd.current)} currency={account.currency} tone={false} />.
            Процентная просадка не показывается: разделить кривую, начинающуюся с нуля, на саму себя нельзя,
            а делить на пополняемый баланс — значит смешивать торговлю с движением денег.
          </p>
        </Card>

        <Card>
          <CardTitle>Распределение R</CardTitle>
          <div className="mt-3 h-48">
            {distribution.buckets.every((b) => b.count === 0) ? (
              <p className="text-sm text-muted">Сделок с известным R за период нет.</p>
            ) : (
              <RHistogram
                data={distribution.buckets.map((b) => ({
                  label: b.label,
                  count: b.count,
                  positive: b.from >= 0,
                }))}
              />
            )}
          </div>
          {distribution.unknown > 0 && (
            <p className="mt-2 text-xs text-muted">
              Ещё {distribution.unknown} сделок с неизвестным R в столбцы не попали.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-2">
            Сумма R — {stats.sumR.known ? formatR(toTrimmedString(stats.sumR.value)) : DASH}. Это
            результат в единицах исходного риска, а не доходность счёта.
          </p>
        </Card>
      </div>

      {notes.length > 0 && (
        <Card className="mt-4">
          <CardTitle className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Наблюдения
          </CardTitle>
          <ul className="mt-3 space-y-2.5">
            {notes.map((o) => (
              <li key={o.code} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2.5 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{o.title}</p>
                  <p className="text-[11px] text-muted-2">{o.basis}</p>
                </div>
                <Link
                  href={tradesLink({})}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  Показать сделки
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-2">
            Это описание данных, а не вывод о причинах. Одна сделка может попадать сразу в несколько
            наблюдений, поэтому суммы по ним пересекаются и не складываются.
          </p>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <GroupCard
          title="По инструментам"
          groups={byInstrument}
          currency={account.currency}
          href={(g) => tradesLink({ q: g.key })}
        />
        <GroupCard
          title="По рынкам"
          groups={byMarket}
          currency={account.currency}
          href={(g) => tradesLink({ market: g.key })}
        />
        <GroupCard
          title="По направлению"
          groups={byDirection}
          currency={account.currency}
          href={(g) => tradesLink({ direction: g.key })}
        />
        <GroupCard title="По дням недели" groups={byWeekday} currency={account.currency} />
      </div>

      <Card className="mt-4">
        <CardTitle>Что именно считалось</CardTitle>
        <dl className="mt-3 space-y-2 text-sm">
          <Definition term="Результат за период">
            сумма денежных проводок (выходы и расходы), случившихся в выбранном окне. Частичный
            выход в одном периоде и финальный в другом попадут в разные периоды.
          </Definition>
          <Definition term="Статистика закрытых">
            сделки, закрытые в периоде, целиком. Поэтому две величины могут не совпадать — они
            отвечают на разные вопросы.
          </Definition>
          <Definition term="Доля выигрышей">
            прибыльные / все закрытые с известным итогом. Безубыточные считаются отдельно:{" "}
            {stats.breakeven}.
          </Definition>
          <Definition term="Средний R">
            только по сделкам с известным исходным риском. Сейчас таких {stats.knownR}, без R —{" "}
            {stats.unknownR}.
          </Definition>
          <Definition term="Открытые позиции">
            в статистику закрытых не входят: их результат ещё не определён. Сейчас открыто{" "}
            {openNow.length}.
          </Definition>
          {data.postingsUnknown > 0 && (
            <Definition term="Пропущено проводок">
              {data.postingsUnknown} — у них неизвестен курс валюты инструмента к валюте счёта, и
              подставлять ноль было бы неправдой.
            </Definition>
          )}
        </dl>
      </Card>
    </div>
  );
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2">{label}</p>
      <p className="mt-2 text-xl font-extrabold leading-tight">{children}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-2">{hint}</p>}
    </Card>
  );
}

function MaybeValue({
  value,
  render,
}: {
  value: Maybe<Decimal>;
  render: (v: Decimal) => string;
}) {
  if (!value.known) {
    return (
      <span className="text-sm font-medium text-muted-2" title={value.reason}>
        недостаточно данных
      </span>
    );
  }
  return <span className="tabular-nums">{render(value.value)}</span>;
}

function GroupCard({
  title,
  groups,
  currency,
  href,
}: {
  title: string;
  groups: ReturnType<typeof groupStats>;
  currency: string;
  href?: (g: ReturnType<typeof groupStats>[number]) => string;
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Закрытых сделок за период нет.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-2">
                <th className="pb-2 font-semibold">Группа</th>
                <th className="pb-2 text-right font-semibold">Сделок</th>
                <th className="pb-2 text-right font-semibold">Итог</th>
                <th className="pb-2 text-right font-semibold">Средний R</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-t border-border">
                  <td className="py-2 pr-2">
                    {href ? (
                      <Link href={href(g)} className="text-primary hover:underline">
                        {g.label}
                      </Link>
                    ) : (
                      g.label
                    )}
                    {g.smallSample && (
                      <span className="ml-1.5 text-[10px] text-muted-2" title="Наблюдений мало для выводов">
                        малая выборка
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted">{g.count}</td>
                  <td className="py-2 text-right">
                    <Money value={toTrimmedString(g.netPnl)} currency={currency} signed />
                  </td>
                  <td className="py-2 text-right">
                    <RValue value={g.avgR.known ? toTrimmedString(g.avgR.value) : null} reason="R неизвестен" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className="font-semibold">{term}:</dt>
      <dd className="min-w-0 flex-1 text-muted">{children}</dd>
    </div>
  );
}

export const dynamic = "force-dynamic";
