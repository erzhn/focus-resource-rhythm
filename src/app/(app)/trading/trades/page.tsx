import Link from "next/link";
import { ListFilter } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { TradeRowCard } from "@/components/trading/trade-row-card";
import { listAccounts, listMarkets, listTrades, tradingAvailable } from "@/lib/trading/queries";

/**
 * Журнал сделок.
 *
 * Фильтры живут в адресе страницы: возврат из карточки сделки восстанавливает
 * список, а ссылкой можно поделиться с самим собой. Пагинация и отбор идут на
 * сервере — выгружать историю в браузер ради показа двадцати строк незачем.
 */

const PAGE_SIZE = 25;

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!tradingAvailable) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Сделки" />
        <EmptyState title="Модуль работает только с базой" />
      </div>
    );
  }

  const accounts = await listAccounts();
  const params = await searchParams;
  const account = accounts.find((a) => a.id === params.account) ?? accounts[0] ?? null;

  if (!account) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Сделки" />
        <SectionTabs />
        <EmptyState title="Счёта пока нет" hint="Создайте счёт на вкладке «Счета»." />
      </div>
    );
  }

  const markets = await listMarkets();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const status = params.status === "open" || params.status === "closed" ? params.status : undefined;
  const direction = params.direction === "long" || params.direction === "short" ? params.direction : undefined;

  const result = await listTrades(
    {
      accountId: account.id,
      status,
      direction,
      marketCode: params.market || undefined,
      from: params.from || undefined,
      to: params.to || undefined,
      search: params.q || undefined,
    },
    page,
    PAGE_SIZE,
  );

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    next.set("account", account.id);
    for (const [k, v] of Object.entries({ ...params, ...patch })) {
      if (k === "account" || !v) continue;
      next.set(k, v);
    }
    return `/trading/trades?${next.toString()}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Торговля"
        title="Сделки"
        subtitle={`${account.title} · найдено ${result.total}`}
      />
      <SectionTabs />

      <Card className="mb-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="account" value={account.id} />

          <Select name="status" label="Статус" value={params.status}>
            <option value="">Все</option>
            <option value="open">Открытые</option>
            <option value="closed">Закрытые</option>
          </Select>

          <Select name="direction" label="Направление" value={params.direction}>
            <option value="">Любое</option>
            <option value="long">Покупка</option>
            <option value="short">Продажа</option>
          </Select>

          <Select name="market" label="Рынок" value={params.market}>
            <option value="">Все рынки</option>
            {markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.title}
              </option>
            ))}
          </Select>

          <Field name="from" label="С даты" value={params.from} type="date" />
          <Field name="to" label="По дату" value={params.to} type="date" />

          <Field name="q" label="Поиск по заметкам" value={params.q} className="sm:col-span-2" />

          <div className="flex items-end lg:col-span-3">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--r-sm)] border border-border-strong px-3 text-xs font-semibold transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              <ListFilter className="h-3.5 w-3.5" /> Применить
            </button>
          </div>
        </form>
      </Card>

      {result.rows.length === 0 ? (
        <EmptyState
          title="Под фильтр ничего не попало"
          hint="Измените условия или сбросьте фильтры."
        />
      ) : (
        <div className="space-y-2">
          {result.rows.map((t) => (
            <TradeRowCard key={t.id} trade={t} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-xs" aria-label="Страницы">
          <PageLink href={link({ page: String(page - 1) })} disabled={page <= 1}>
            ← Назад
          </PageLink>
          <span className="text-muted-2">
            Страница {page} из {totalPages}
          </span>
          <PageLink href={link({ page: String(page + 1) })} disabled={page >= totalPages}>
            Вперёд →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

const fieldCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

function Select({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={fieldCls}>
        {children}
      </select>
    </label>
  );
}

function Field({
  name,
  label,
  value,
  type = "text",
  className = "",
}: {
  name: string;
  label: string;
  value?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <input type={type} name={name} defaultValue={value ?? ""} className={fieldCls} />
    </label>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-muted-2 opacity-50">{children}</span>;
  return (
    <Link href={href} className="text-primary hover:underline">
      {children}
    </Link>
  );
}

export const dynamic = "force-dynamic";
