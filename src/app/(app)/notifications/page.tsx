"use client";

import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { Bell, BellOff } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Card, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { Reveal, RevealList, RevealItem } from "@/components/ui/reveal";
import { plural } from "@/lib/ui/text";

interface DerivedNotification {
  id: string;
  title: string;
  body: string;
  href: string;
  tone: "info" | "warning" | "danger";
}

export default function NotificationsPage() {
  const { state, now, focusResults } = useStore();

  const items: DerivedNotification[] = [];

  if (!state.dayPlanConfirmed) {
    items.push({
      id: "plan",
      title: "План на сегодня ещё не подтверждён",
      body: "Пройдите утреннюю проверку и подтвердите план дня.",
      href: "/",
      tone: "info",
    });
  }

  const overdue = state.tasks.filter(
    (t) => t.dueDate && differenceInCalendarDays(now, t.dueDate) > 0 && t.status !== "done",
  );
  overdue.forEach((t) =>
    items.push({
      id: `overdue-${t.id}`,
      title: "Задача просрочена",
      body: t.title,
      href: "/plans",
      tone: "danger",
    }),
  );

  focusResults
    .filter((r) => r.zone === "now" && !r.hasNextAction)
    .forEach((r) =>
      items.push({
        id: `noaction-${r.id}`,
        title: "У активного результата нет ближайшего действия",
        body: r.title,
        href: "/goals",
        tone: "warning",
      }),
    );

  const toneVar: Record<DerivedNotification["tone"], string> = {
    info: "var(--zone-next)",
    warning: "var(--warning)",
    danger: "var(--danger)",
  };

  return (
    <div>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Сигналы</span>}
        title="Уведомления"
        subtitle={
          items.length === 0
            ? "Каждое ведёт к конкретному действию."
            : `${items.length} ${plural(items.length, "сигнал", "сигнала", "сигналов")} · каждое ведёт к действию.`
        }
      />

      {items.length === 0 ? (
        <Reveal>
          <EmptyState
            icon={<BellOff className="h-6 w-6" />}
            title="Уведомлений нет"
            hint="Всё под контролем — новые сигналы появятся, когда что-то потребует внимания."
          />
        </Reveal>
      ) : (
        <RevealList className="space-y-2">
          {items.map((n) => (
            <RevealItem key={n.id}>
              <Link href={n.href} className="block">
                <Card interactive className="flex items-start gap-3">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: toneVar[n.tone] }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-muted">{n.body}</p>
                  </div>
                </Card>
              </Link>
            </RevealItem>
          ))}
        </RevealList>
      )}
    </div>
  );
}
