"use client";

import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { Bell } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Card, EmptyState } from "@/components/ui/primitives";

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
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <Bell className="h-5 w-5" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Уведомления</h1>
          <p className="text-sm text-muted">
            Непрочитанных: {items.length}. Каждое ведёт к конкретному действию.
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState title="Уведомлений нет" hint="Всё под контролем." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Link key={n.id} href={n.href}>
              <Card className="flex items-start gap-3 transition hover:bg-surface-2">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: toneVar[n.tone] }}
                />
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted">{n.body}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
