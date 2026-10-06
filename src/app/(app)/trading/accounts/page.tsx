import Link from "next/link";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { AccountForm } from "@/components/trading/account-form";
import { SpecForm } from "@/components/trading/spec-form";
import { Money } from "@/components/trading/value";
import { listAccounts, listInstruments, listMarkets, listSpecs, tradingAvailable } from "@/lib/trading/queries";
import { VOLUME_UNIT_LABELS } from "@/domain/trading/types";
import { formatPrice } from "@/domain/trading/format";

/**
 * Счета и спецификации.
 *
 * Спецификация — то, без чего риск посчитать не из чего. Поэтому ненастроенные
 * инструменты видны отдельным списком, а не прячутся: лучше честное «нужно
 * настроить», чем расчёт по выдуманному множителю.
 */

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  if (!tradingAvailable) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Счета" />
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="Модуль работает только с базой" />
      </div>
    );
  }

  const [accounts, markets] = await Promise.all([listAccounts(), listMarkets()]);
  const { account: requested } = await searchParams;
  const account = accounts.find((a) => a.id === requested) ?? accounts[0] ?? null;

  const [specs, instruments] = account
    ? await Promise.all([listSpecs(account.id), listInstruments()])
    : [[], []];

  // Последняя версия спецификации на инструмент: прежние остаются в истории.
  const current = new Map<string, (typeof specs)[number]>();
  for (const s of specs) {
    const kept = current.get(s.instrument_id);
    if (!kept || s.version > kept.version) current.set(s.instrument_id, s);
  }
  const configured = [...current.values()].filter((s) => s.is_configured);

  return (
    <div>
      <PageHeader
        eyebrow="Торговля"
        title="Счета и спецификации"
        subtitle="Валюта, часовой пояс и условия инструментов у вашего брокера."
        actions={<AccountForm />}
      />
      <SectionTabs />

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Счёта пока нет"
          hint="Начальный баланс фиксируется на дату начала учёта один раз. Пополнения ведутся отдельно и прибылью не считаются."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <Link key={a.id} href={`/trading/accounts?account=${a.id}`} className="block">
                <Card
                  className={`h-full transition-colors ${
                    a.id === account?.id ? "border-primary" : "hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <CardTitle>{a.title}</CardTitle>
                    {a.is_demo && (
                      <span className="rounded bg-[var(--warning)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]">
                        демо
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-lg font-extrabold">
                    <Money value={a.book_balance} currency={a.currency} tone={false} />
                  </p>
                  <p className="mt-1 text-[11px] text-muted-2">
                    {a.broker ? `${a.broker} · ` : ""}
                    {a.currency} · {a.timezone}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-2">
                    учёт с {a.opening_date} · начальный баланс{" "}
                    <Money value={a.opening_balance} currency={a.currency} tone={false} />
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          {account && (
            <>
              <Card>
                <CardTitle>Настроенные инструменты — {account.title}</CardTitle>
                {configured.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    Пока ни одного. Без спецификации сделку записать нельзя: неизвестно, во что
                    превращается движение цены.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-2">
                          <th className="pb-2 font-semibold">Инструмент</th>
                          <th className="pb-2 font-semibold">Единица</th>
                          <th className="pb-2 text-right font-semibold">Множитель</th>
                          <th className="pb-2 text-right font-semibold">Мин. / шаг</th>
                          <th className="pb-2 text-right font-semibold">Версия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configured.map((s) => (
                          <tr key={s.id} className="border-t border-border">
                            <td className="py-2 pr-2">
                              <span className="font-medium">{s.instrument_code}</span>
                              <span className="ml-1.5 text-muted-2">{s.quote_currency}</span>
                            </td>
                            <td className="py-2 text-muted">{VOLUME_UNIT_LABELS[s.volume_unit]}</td>
                            <td className="py-2 text-right tabular-nums">
                              {formatPrice(s.contract_multiplier)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted">
                              {formatPrice(s.min_volume)} / {formatPrice(s.volume_step)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted-2">v{s.version}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <SpecForm
                accountId={account.id}
                markets={markets.map((m) => ({ code: m.code, title: m.title }))}
                instruments={instruments.map((i) => ({
                  id: i.id,
                  code: i.code,
                  display_name: i.display_name,
                  market_code: i.market_code,
                  quote_currency: i.quote_currency,
                }))}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
