import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { RulesForm, type RuleState } from "@/components/trading/rules-form";
import { listAccounts, tradingAvailable } from "@/lib/trading/queries";
import { createClient } from "@/lib/supabase/server";
import { ensureRuleSet } from "@/lib/trading/rules-data";
import { RULE_DEFINITIONS, type RuleCode } from "@/domain/trading/rules";

/**
 * Правила и стратегии.
 *
 * Набор правил создаётся при первом открытии экрана — весь выключенным и без
 * порогов. Так человек видит, что именно приложение умеет проверять, но ни
 * одно ограничение не появляется у него за спиной.
 */

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  if (!tradingAvailable) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Правила" />
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Модуль работает только с базой" />
      </div>
    );
  }

  const accounts = await listAccounts();
  const params = await searchParams;
  const account = accounts.find((a) => a.id === params.account) ?? accounts[0] ?? null;

  if (!account) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Правила" />
        <SectionTabs />
        <EmptyState title="Счёта пока нет" hint="Создайте счёт на вкладке «Счета»." />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Правила" />
        <EmptyState title="Нужно войти в аккаунт" />
      </div>
    );
  }

  const set = await ensureRuleSet(supabase, user.id, account.id);
  const stored = new Map(set.rules.map((r) => [r.rule_code, r]));

  const initial: RuleState[] = RULE_DEFINITIONS.map((definition) => {
    const row = stored.get(definition.code);
    return {
      code: definition.code as RuleCode,
      enabled: row?.enabled ?? false,
      mode: row?.mode ?? "warn",
      weight: row?.weight ? String(row.weight) : "1",
      params: Object.fromEntries(
        Object.entries(row?.params ?? {}).map(([k, v]) => [k, v === null ? "" : String(v)]),
      ),
    };
  });

  const enabled = initial.filter((r) => r.enabled).length;
  const withoutThreshold = initial.filter((r) => {
    const definition = RULE_DEFINITIONS.find((d) => d.code === r.code);
    return r.enabled && definition?.param && !r.params[definition.param.key]?.trim();
  }).length;

  return (
    <div>
      <PageHeader
        eyebrow="Торговля"
        title="Правила"
        subtitle={`${account.title} · включено ${enabled} из ${RULE_DEFINITIONS.length}${
          withoutThreshold > 0 ? ` · без порога ${withoutThreshold}` : ""
        }`}
      />
      <SectionTabs />

      {enabled === 0 && (
        <Card className="mb-4">
          <p className="text-sm text-muted">
            Ни одно правило не включено, поэтому оценка дисциплины считаться не из чего. Включите
            те ограничения, которые у вас действительно есть, и задайте их пороги — чужие значения
            здесь не подставляются.
          </p>
        </Card>
      )}

      <RulesForm accountId={account.id} initial={initial} />
    </div>
  );
}

export const dynamic = "force-dynamic";
