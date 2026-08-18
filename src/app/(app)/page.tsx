"use client";

import { differenceInCalendarDays } from "date-fns";
import { motion } from "motion/react";
import {
  AlertTriangle, CalendarClock, Check, CheckCircle2, Clock,
  Coins, Flame, Sparkles, Star, Zap,
} from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { TaskRow } from "@/components/task-row";
import { useTaskEdit } from "@/components/task-edit";
import { Button, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ResourceMeter } from "@/components/ui/resource-meter";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Reveal, RevealItem, RevealList } from "@/components/ui/reveal";
import { ENERGY_BAND_LABELS, energyBand } from "@/domain/resources";
import { formatDate, formatMinutes, formatMoney, formatTime } from "@/lib/format";
import { greeting } from "@/lib/ui/text";
import type { Scale1to5 } from "@/domain/types";
import type { DemoTask } from "@/lib/demo/types";

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export default function TodayPage() {
  const { state, now, dayPlan, confirmDayPlan, setMorningEnergy, focusResults } = useStore();
  const byId = (id: string) => state.tasks.find((t) => t.id === id)!;

  const activeResults = state.results.filter((r) => r.zone === "now");
  const todayEvents = state.events
    .filter((e) => differenceInCalendarDays(e.start, now) === 0)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const overdue = state.tasks.filter(
    (t) => t.dueDate && differenceInCalendarDays(now, t.dueDate) > 0 && t.status !== "done",
  );
  const moneyLimit = state.dailyMoneyLimitMajor;
  const plannedMoney = state.tasks.reduce((s, t) => s + t.plannedMoneyMinor, 0) / 100;

  const stateOfDay = state.dayPlanConfirmed
    ? "План подтверждён — двигайтесь по ритму."
    : !dayPlan.main
      ? "Выберите главное дело — с него начнётся день."
      : dayPlan.warnings.length > 0
        ? "День плотный. Есть, что можно разгрузить."
        : "День собран. Фокус ясен.";

  // Инсайты — только осмысленные, ведут к действию.
  const insights: { tone: "attention" | "warning" | "primary"; text: string }[] = [];
  dayPlan.warnings.forEach((w) => insights.push({ tone: "warning", text: w }));
  focusResults
    .filter((r) => r.zone === "now" && !r.hasNextAction)
    .forEach((r) => insights.push({ tone: "attention", text: `«${r.title}» — активный результат без ближайшего действия.` }));
  if (overdue.length > 0) insights.push({ tone: "attention", text: `Просроченных задач: ${overdue.length}. Разберите на вечернем обзоре.` });

  return (
    <div className="space-y-6">
      {/* Приветствие */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-primary">
              {WEEKDAYS[now.getDay()]}, {now.getDate()} {MONTHS[now.getMonth()]}
            </div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">{greeting(now)}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <Sparkles className="h-4 w-4 text-primary" /> {stateOfDay}
            </p>
          </div>
          <DayPlanStatus confirmed={state.dayPlanConfirmed} onConfirm={confirmDayPlan} />
        </div>
      </Reveal>

      {/* Фокусный блок — главное дело */}
      <Reveal transition={{ delay: 0.04 }}>
        {dayPlan.main ? (
          <FocusTask task={byId(dayPlan.main.task.id)} explanation={dayPlan.main.explanation} score={dayPlan.main.score} />
        ) : (
          <EmptyState
            icon={<Star className="h-6 w-6" />}
            title="Главное дело ещё не выбрано"
            hint="Добавьте задачу или снимите блокировки зависимостей — система предложит фокус дня."
          />
        )}
      </Reveal>

      {/* Ресурсы дня */}
      <RevealList className="grid gap-3 sm:grid-cols-3">
        <RevealItem>
          <ResourceMeter
            icon={Clock}
            label="Время"
            color="var(--primary)"
            value={dayPlan.plannableMinutes ? Math.min(1, dayPlan.plannedMinutes / dayPlan.plannableMinutes) : 0}
            detail={`${formatMinutes(dayPlan.plannedMinutes)} из ${formatMinutes(dayPlan.plannableMinutes)} · резерв ${formatMinutes(dayPlan.reserveMinutes)}`}
          />
        </RevealItem>
        <RevealItem>
          <EnergyMeter value={state.morningEnergy as Scale1to5} onChange={setMorningEnergy} />
        </RevealItem>
        <RevealItem>
          <ResourceMeter
            icon={Coins}
            label="Деньги"
            color="var(--resource)"
            value={moneyLimit ? Math.min(1, plannedMoney / moneyLimit) : 0}
            detail={moneyLimit === null ? "Лимит не задан" : `${formatMoney(plannedMoney)} из ${formatMoney(moneyLimit)}`}
          />
        </RevealItem>
      </RevealList>

      {/* Лента дня + вторичные секции */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted" />
              <CardTitle>Лента дня</CardTitle>
            </div>
            <Timeline events={todayEvents} timeblocks={state.tasks.filter((t) => t.scheduledStart && t.scheduledEnd)} now={now} />
          </Card>

          {dayPlan.secondary.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-bold">Дополнительные задачи</h2>
              <RevealList className="space-y-2">
                {dayPlan.secondary.map((p) => (
                  <RevealItem key={p.task.id}>
                    <TaskRow task={byId(p.task.id)} />
                  </RevealItem>
                ))}
              </RevealList>
            </section>
          )}

          {dayPlan.recurring.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-bold">Повторяющиеся дела</h2>
              <RevealList className="space-y-2">
                {dayPlan.recurring.map((p) => (
                  <RevealItem key={p.task.id}>
                    <TaskRow task={byId(p.task.id)} />
                  </RevealItem>
                ))}
              </RevealList>
            </section>
          )}
        </div>

        <div className="space-y-5 lg:col-span-2">
          {insights.length > 0 && (
            <Card>
              <CardTitle>Рекомендации</CardTitle>
              <div className="mt-3 space-y-2">
                {insights.slice(0, 4).map((ins, i) => (
                  <InsightRow key={i} tone={ins.tone} text={ins.text} />
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle>Три активных результата</CardTitle>
            <div className="mt-3 space-y-4">
              {activeResults.length === 0 && <p className="text-sm text-muted">Пока нет активных результатов.</p>}
              {activeResults.map((r) => {
                const noAction = !focusResults.find((f) => f.id === r.id)?.hasNextAction;
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <ProgressRing value={r.progress} size={48} stroke={5} color="var(--zone-now)">
                      <span className="text-[11px] font-bold">{Math.round(r.progress * 100)}</span>
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      {noAction && (
                        <p className="text-[11px] text-[var(--attention)]">Нет ближайшего действия</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {overdue.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-bold text-[var(--danger)]">Просроченные</h2>
              <div className="space-y-2">
                {overdue.slice(0, 3).map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function DayPlanStatus({ confirmed, onConfirm }: { confirmed: boolean; onConfirm: () => void }) {
  if (confirmed) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3.5 py-2 text-sm font-semibold text-success">
        <CheckCircle2 className="h-4 w-4" /> План дня подтверждён
      </div>
    );
  }
  return (
    <Button onClick={onConfirm} size="md">
      <Check className="h-4 w-4" /> Подтвердить план дня
    </Button>
  );
}

function FocusTask({ task, explanation, score }: { task: DemoTask; explanation: string; score: number }) {
  const { toggleDone } = useStore();
  const { open: openEdit } = useTaskEdit();
  const done = task.status === "done";
  const level = score >= 70 ? "var(--danger)" : score >= 40 ? "var(--warning)" : "var(--primary)";

  return (
    <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-primary/25 bg-surface p-6 shadow-soft-lg">
      {/* деликатный градиент-подсветка */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--primary-soft), transparent 70%)" }}
      />
      <div className="relative flex items-start gap-5">
        <button
          onClick={() => toggleDone(task.id)}
          aria-label={done ? "Вернуть в работу" : "Отметить главное дело выполненным"}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 transition-colors ${
            done ? "border-success bg-success text-white" : "border-border-strong hover:border-primary"
          }`}
        >
          <motion.span initial={false} animate={{ scale: done ? 1 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
            <Check className="h-4 w-4" />
          </motion.span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-primary">
            <Star className="h-3.5 w-3.5" /> Главное дело дня
          </div>
          <h2 className={`mt-1.5 text-xl font-extrabold leading-snug md:text-2xl ${done ? "text-muted line-through" : ""}`}>
            {task.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatMinutes(task.plannedMinutes)}</span>
            {task.dueDate && <span>срок {formatDate(task.dueDate)}</span>}
            {task.scheduledStart && task.scheduledEnd && (
              <span>{formatTime(task.scheduledStart)}–{formatTime(task.scheduledEnd)}</span>
            )}
          </div>
          <p className="mt-3 max-w-xl text-sm text-muted">{explanation}</p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="soft" onClick={() => openEdit(task.id)}>Изменить</Button>
            {!done && (
              <Button size="sm" variant="ghost" onClick={() => toggleDone(task.id)}>
                <Check className="h-4 w-4" /> Выполнено
              </Button>
            )}
          </div>
        </div>

        <div className="hidden shrink-0 sm:block">
          <ProgressRing value={score / 100} size={84} stroke={7} color={level} label={`Приоритет ${score} из 100`}>
            <div className="text-center leading-none">
              <div className="text-xl font-extrabold" style={{ color: level }}>
                <AnimatedNumber value={score} />
              </div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-2">приоритет</div>
            </div>
          </ProgressRing>
        </div>
      </div>
    </div>
  );
}

function EnergyMeter({ value, onChange }: { value: Scale1to5; onChange: (v: number) => void }) {
  const band = energyBand(value);
  const color = band === "low" ? "var(--energy-low)" : band === "medium" ? "var(--energy-medium)" : "var(--energy-high)";
  return (
    <div className="rounded-[var(--r)] border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
            {band === "low" ? <Zap className="h-3.5 w-3.5" /> : <Flame className="h-3.5 w-3.5" />}
          </span>
          Силы
        </div>
        <span className="text-[11px] font-semibold" style={{ color }}>{ENERGY_BAND_LABELS[band]}</span>
      </div>
      <div className="mt-2.5 flex gap-1.5" role="radiogroup" aria-label="Уровень сил">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`Силы ${n} из 5`}
            onClick={() => onChange(n)}
            className="h-7 flex-1 rounded-md transition-all"
            style={{ backgroundColor: n <= value ? color : "var(--surface-3)" }}
          />
        ))}
      </div>
    </div>
  );
}

function InsightRow({ tone, text }: { tone: "attention" | "warning" | "primary"; text: string }) {
  const color = tone === "attention" ? "var(--attention)" : tone === "warning" ? "var(--warning)" : "var(--primary)";
  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--r-sm)] border p-2.5 text-xs"
      style={{ borderColor: `color-mix(in oklab, ${color} 30%, transparent)`, backgroundColor: `color-mix(in oklab, ${color} 8%, transparent)` }}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
      <span className="text-foreground">{text}</span>
    </div>
  );
}

function Timeline({
  events,
  timeblocks,
  now,
}: {
  events: { id: string; title: string; start: Date; end: Date; fixed: boolean }[];
  timeblocks: DemoTask[];
  now: Date;
}) {
  const items = [
    ...events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, kind: e.fixed ? ("fixed" as const) : ("flex" as const) })),
    ...timeblocks.map((t) => ({ id: t.id, title: t.title, start: t.scheduledStart!, end: t.scheduledEnd!, kind: "task" as const })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  if (items.length === 0) {
    return <p className="mt-3 text-sm text-muted">На сегодня нет запланированных по времени событий и блоков.</p>;
  }

  const color = (k: string) => (k === "fixed" ? "var(--zone-next)" : k === "flex" ? "var(--zone-later)" : "var(--primary)");
  const label = (k: string) => (k === "fixed" ? "Событие" : k === "flex" ? "Гибкое" : "Блок задачи");
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="mt-3">
      <RevealList className="relative space-y-0 pl-1">
        <div className="absolute bottom-2 left-[70px] top-2 w-px bg-border" aria-hidden />
        {items.map((it) => {
          const startMin = it.start.getHours() * 60 + it.start.getMinutes();
          const isPast = nowMin > it.end.getHours() * 60 + it.end.getMinutes();
          const isNow = nowMin >= startMin && nowMin <= it.end.getHours() * 60 + it.end.getMinutes();
          return (
            <RevealItem key={it.id}>
              <div className={`flex items-stretch gap-3 py-2 ${isPast ? "opacity-55" : ""}`}>
                <div className="w-14 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-muted">
                  {formatTime(it.start)}
                </div>
                <div className="relative flex w-4 shrink-0 justify-center">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--surface)]"
                    style={{ backgroundColor: color(it.kind), boxShadow: isNow ? `0 0 0 4px color-mix(in oklab, ${color(it.kind)} 25%, transparent)` : undefined }}
                  />
                </div>
                <div className="min-w-0 flex-1 rounded-[var(--r-sm)] border border-border bg-surface-2/50 px-3 py-2">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  <p className="text-[11px] text-muted-2">
                    {label(it.kind)} · {formatTime(it.start)}–{formatTime(it.end)} {isNow && <span className="font-semibold text-primary">· сейчас</span>}
                  </p>
                </div>
              </div>
            </RevealItem>
          );
        })}
      </RevealList>
    </div>
  );
}
