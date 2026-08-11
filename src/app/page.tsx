"use client";

import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, Star } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { TaskRow } from "@/components/task-row";
import { Button, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { ENERGY_BAND_LABELS, energyBand } from "@/domain/resources";
import { formatDate, formatMinutes, formatMoney, formatTime } from "@/lib/format";
import type { Scale1to5 } from "@/domain/types";

export default function TodayPage() {
  const {
    state,
    now,
    dayPlan,
    resources,
    confirmDayPlan,
    setMorningEnergy,
    focusResults,
  } = useStore();

  const activeResults = state.results.filter((r) => r.zone === "now");
  const todayEvents = state.events
    .filter((e) => differenceInCalendarDays(e.start, now) === 0)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const overdue = state.tasks.filter(
    (t) => t.dueDate && differenceInCalendarDays(now, t.dueDate) > 0 && t.status !== "done",
  );
  const moneyLimit = state.dailyMoneyLimitMajor;
  const byId = (id: string) => state.tasks.find((t) => t.id === id)!;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-muted">{formatDate(now)}</p>
        <h1 className="text-2xl font-bold tracking-tight">Сегодня</h1>
        <p className="mt-1 text-sm text-muted">Что мне действительно нужно сделать сегодня.</p>
      </header>

      {/* Утренняя проверка: силы + время */}
      <Card>
        <CardTitle>Утренняя проверка</CardTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">
              Уровень сил ({ENERGY_BAND_LABELS[energyBand(state.morningEnergy as Scale1to5)]})
            </p>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setMorningEnergy(n)}
                  aria-label={`Силы ${n}`}
                  className={`h-8 w-8 rounded-lg border text-sm ${
                    state.morningEnergy === n ? "border-primary bg-primary text-primary-fg" : "border-border"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted">Доступное время</p>
            <p className="mt-1 text-lg font-semibold">{formatMinutes(resources.availableMinutes)}</p>
            <p className="text-[11px] text-muted">
              Резерв {formatMinutes(dayPlan.reserveMinutes)} · под планирование {formatMinutes(dayPlan.plannableMinutes)}
            </p>
          </div>
        </div>
      </Card>

      {/* Главное дело */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-[var(--warning)]" />
          <h2 className="text-sm font-semibold">Главное дело</h2>
        </div>
        {dayPlan.main ? (
          <>
            <TaskRow task={byId(dayPlan.main.task.id)} />
            <p className="text-xs text-muted">{dayPlan.main.explanation}</p>
          </>
        ) : (
          <EmptyState title="Нет главного дела" hint="Добавьте задачу или снимите блокировки зависимостей." />
        )}
      </section>

      {/* Дополнительные и повторяющиеся */}
      {dayPlan.secondary.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Дополнительные задачи (до двух)</h2>
          {dayPlan.secondary.map((p) => (
            <TaskRow key={p.task.id} task={byId(p.task.id)} />
          ))}
        </section>
      )}
      {dayPlan.recurring.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Обязательные повторяющиеся дела</h2>
          {dayPlan.recurring.map((p) => (
            <TaskRow key={p.task.id} task={byId(p.task.id)} />
          ))}
        </section>
      )}

      {/* Предупреждения */}
      {dayPlan.warnings.length > 0 && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/10">
          <div className="flex items-center gap-2 text-[var(--warning)]">
            <AlertTriangle className="h-4 w-4" />
            <CardTitle className="text-[var(--warning)]">Предупреждения</CardTitle>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {dayPlan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Ресурсы дня */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Время</CardTitle>
          <p className="mt-2 text-lg font-semibold">{formatMinutes(dayPlan.plannedMinutes)}</p>
          <p className="text-[11px] text-muted">план из {formatMinutes(dayPlan.plannableMinutes)}</p>
        </Card>
        <Card>
          <CardTitle>Деньги (лимит дня)</CardTitle>
          <p className="mt-2 text-lg font-semibold">
            {moneyLimit === null ? "—" : formatMoney(moneyLimit)}
          </p>
          <p className="text-[11px] text-muted">
            план {formatMoney(state.tasks.reduce((s, t) => s + t.plannedMoneyMinor, 0) / 100)}
          </p>
        </Card>
        <Card>
          <CardTitle>Резерв</CardTitle>
          <p className="mt-2 text-lg font-semibold">{formatMinutes(dayPlan.reserveMinutes)}</p>
          <p className="text-[11px] text-muted">{Math.round(state.reserveRatio * 100)}% дня</p>
        </Card>
      </div>

      {/* Фиксированные события */}
      <Card>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted" />
          <CardTitle>Ближайшие фиксированные события</CardTitle>
        </div>
        {todayEvents.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Сегодня событий нет.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {todayEvents.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>
                  {e.title} {e.fixed ? "" : "(гибкое)"}
                </span>
                <span className="text-muted">
                  {formatTime(e.start)}–{formatTime(e.end)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Просроченные */}
      {overdue.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--danger)]">Просроченные задачи</h2>
          {overdue.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </section>
      )}

      {/* Прогресс активных результатов */}
      <Card>
        <CardTitle>Прогресс трёх активных результатов</CardTitle>
        <div className="mt-3 space-y-3">
          {activeResults.map((r) => {
            const noAction = !focusResults.find((f) => f.id === r.id)?.hasNextAction;
            return (
              <div key={r.id}>
                <div className="flex justify-between text-sm">
                  <span>{r.title}</span>
                  <span className="text-muted">{Math.round(r.progress * 100)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${r.progress * 100}%`, backgroundColor: "var(--zone-now)" }}
                  />
                </div>
                {noAction && (
                  <p className="mt-1 text-[11px] text-[var(--warning)]">
                    Нет ближайшего действия — добавьте физический шаг.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Подтверждение плана дня */}
      <div className="sticky bottom-20 md:bottom-4">
        {state.dayPlanConfirmed ? (
          <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            План дня подтверждён.
          </div>
        ) : (
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">План дня — черновик</p>
              <p className="text-xs text-muted">Редактируйте свободно, затем подтвердите.</p>
            </div>
            <Button onClick={confirmDayPlan}>Подтвердить план дня</Button>
          </Card>
        )}
      </div>
    </div>
  );
}
