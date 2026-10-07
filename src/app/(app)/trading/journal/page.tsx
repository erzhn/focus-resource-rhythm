import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { SectionTabs } from "@/components/trading/section-tabs";
import { JournalDayForm } from "@/components/trading/journal-day-form";
import { Money } from "@/components/trading/value";
import { listAccounts, tradingAvailable } from "@/lib/trading/queries";
import { currentMonth, loadJournalMonth, type JournalDay } from "@/lib/trading/journal";
import { toTrimmedString } from "@/domain/trading/decimal";

/**
 * Дневник.
 *
 * Календарь различает четыре состояния дня, которые обычно сваливают в одно:
 * торговли не было, был выходной, позиции ещё открыты, разбор не завершён.
 * Иначе «пропусков» набирается столько, что показатель перестаёт что-либо
 * значить.
 */

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; month?: string; day?: string }>;
}) {
  if (!tradingAvailable) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Дневник" />
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Модуль работает только с базой" />
      </div>
    );
  }

  const accounts = await listAccounts();
  const params = await searchParams;
  const account = accounts.find((a) => a.id === params.account) ?? accounts[0] ?? null;

  if (!account) {
    return (
      <div>
        <PageHeader eyebrow="Торговля" title="Дневник" />
        <SectionTabs />
        <EmptyState title="Счёта пока нет" hint="Создайте счёт на вкладке «Счета»." />
      </div>
    );
  }

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentMonth();
  const { days } = await loadJournalMonth(account.id, account.currency, month);
  const selected = days.find((d) => d.date === params.day) ?? null;

  const [year, monthIndex] = month.split("-").map(Number);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  // Первый день месяца по понедельничной неделе.
  const firstWeekday = (new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay() + 6) % 7;
  const pending = days.filter((d) => d.reviewPending).length;
  const traded = days.filter((d) => d.trades > 0).length;

  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ account: account.id, month });
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/trading/journal?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Торговля"
        title="Дневник"
        subtitle={`${account.title} · торговых дней ${traded}${pending > 0 ? ` · разбор не завершён: ${pending}` : ""}`}
        actions={
          <div className="flex items-center gap-1 rounded-[var(--r)] bg-surface-2 p-1">
            <Link
              href={`/trading/journal?account=${account.id}&month=${prev}`}
              aria-label="Предыдущий месяц"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="px-2 text-xs font-medium tabular-nums">
              {MONTHS[monthIndex - 1]} {year}
            </span>
            <Link
              href={`/trading/journal?account=${account.id}&month=${next}`}
              aria-label="Следующий месяц"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] text-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        }
      />
      <SectionTabs />

      <Card>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-2">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {days.map((day) => (
            <DayCell
              key={day.date}
              day={day}
              currency={account.currency}
              href={link({ day: day.date })}
              selected={day.date === selected?.date}
            />
          ))}
        </div>

        <Legend />
      </Card>

      {selected && (
        <div className="mt-4">
          <JournalDayForm
            accountId={account.id}
            day={selected}
            currency={account.currency}
          />
        </div>
      )}
    </div>
  );
}

function DayCell({
  day,
  currency,
  href,
  selected,
}: {
  day: JournalDay;
  currency: string;
  href: string;
  selected: boolean;
}) {
  const number = Number(day.date.slice(8));
  const hasResult = day.net !== null;

  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`flex min-h-[64px] flex-col rounded-[var(--r-sm)] border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${
        selected ? "border-primary bg-[var(--primary-soft)]" : "border-border/70 hover:bg-surface-2"
      } ${day.isDayOff ? "opacity-60" : ""}`}
    >
      <span className="flex items-center justify-between text-[11px] tabular-nums text-muted-2">
        {number}
        {day.reviewPending && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]"
            title="Разбор дня не завершён"
            aria-label="Разбор не завершён"
          />
        )}
      </span>

      {day.trades > 0 && (
        <span className="mt-auto text-[11px] font-semibold">
          {hasResult ? (
            <Money value={toTrimmedString(day.net!)} currency={currency} signed maxFraction={0} />
          ) : day.hasOpen ? (
            <span className="text-muted-2">открыта</span>
          ) : (
            <span className="text-muted-2" title="Денежный итог неизвестен">
              итог неизвестен
            </span>
          )}
        </span>
      )}

      {day.trades > 0 && (
        <span className="text-[10px] text-muted-2">
          {day.trades} {day.trades === 1 ? "сделка" : "сдел."}
        </span>
      )}

      {day.trades === 0 && day.isDayOff && (
        <span className="mt-auto text-[10px] text-muted-2">выходной</span>
      )}
    </Link>
  );
}

function Legend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-2">
      <li className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" /> разбор не завершён
      </li>
      <li>«открыта» — позиции ещё не закрыты, итог дня не определён</li>
      <li>«выходной» — запланированный, в пропуски не считается</li>
    </ul>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";
