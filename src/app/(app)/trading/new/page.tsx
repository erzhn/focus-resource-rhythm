import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { TradeForm } from "@/components/trading/trade-form";
import { listAccounts, listMarkets, listSpecs, tradingAvailable } from "@/lib/trading/queries";

/** Проверка плана и запись факта входа. */
export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  if (!tradingAvailable) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Новая сделка" />
        <EmptyState title="Модуль работает только с базой" />
      </div>
    );
  }

  const accounts = await listAccounts();
  if (accounts.length === 0) redirect("/trading/accounts");

  const { account: requested } = await searchParams;
  const account = accounts.find((a) => a.id === requested) ?? accounts[0];
  const [specs, markets] = await Promise.all([listSpecs(account.id), listMarkets()]);

  // На инструмент берём последнюю версию спецификации.
  const latest = new Map<string, (typeof specs)[number]>();
  for (const s of specs) {
    const kept = latest.get(s.instrument_id);
    if (!kept || s.version > kept.version) latest.set(s.instrument_id, s);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Торговля"
        title="Новая сделка"
        subtitle={`${account.title} · ${account.currency}`}
      />
      <SectionTabs />

      <TradeForm
        accountId={account.id}
        accountCurrency={account.currency}
        markets={markets.map((m) => ({ code: m.code, title: m.title }))}
        specs={[...latest.values()].map((s) => ({
          instrument_id: s.instrument_id,
          instrument_code: s.instrument_code,
          instrument_name: s.instrument_name,
          market_code: s.market_code,
          quote_currency: s.quote_currency,
          volume_unit: s.volume_unit,
          is_configured: s.is_configured,
        }))}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
