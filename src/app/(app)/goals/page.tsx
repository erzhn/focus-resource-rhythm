"use client";

import { useMemo } from "react";
import { Target, CornerDownRight, CheckCircle2, CircleDashed, Wallet } from "lucide-react";
import { FOCUS_ZONE_LABELS } from "@/domain/focus";
import { useStore } from "@/lib/demo/store";
import { buildGoalTree, type GoalTreeResult } from "@/lib/ui/goal-tree";
import { plural } from "@/lib/ui/text";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Reveal, RevealList, RevealItem } from "@/components/ui/reveal";
import { Card, CardTitle, EmptyState, Badge } from "@/components/ui/primitives";
import { spendingByArea } from "@/domain/finance/spheres";
import { monthOf } from "@/domain/finance/day";
import { formatMinor } from "@/domain/finance/format";

export default function GoalsPage() {
  const { state, financialToday } = useStore();
  const tree = buildGoalTree(state.lifeAreas, state.results, state.tasks);
  const currency = state.mainCurrency ?? "KGS";

  /**
   * Сколько денег ушло в каждую сферу за текущий месяц.
   *
   * Связь идёт через сопоставление «категория → сфера» из настроек: сфера не
   * спрашивается при записи расхода, чтобы быстрый ввод оставался быстрым.
   */
  const money = useMemo(() => {
    const month = monthOf(financialToday);
    const monthTxs = state.transactions
      .filter((t) => monthOf(t.day) === month)
      .map((t) => ({ ...t, occurredAt: new Date(t.occurredAt) }));
    return spendingByArea(monthTxs, state.categoryAreas, currency);
  }, [state.transactions, state.categoryAreas, financialToday, currency]);

  const spentIn = (areaId: string) =>
    money.areas.find((a) => a.areaId === areaId)?.amountMinor ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Направление"
        title="Цели и проекты"
        subtitle="Сфера жизни → Цель / Проект → Задача → Ближайшее действие."
      />

      {tree.length === 0 ? (
        <Reveal>
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title="Пока нет целей и проектов"
            hint="Свяжите результаты со сферами жизни — здесь появится дерево с прогрессом."
          />
        </Reveal>
      ) : (
        <RevealList className="space-y-4">
          {tree.map((area) => (
            <RevealItem key={area.id}>
              <Card>
                <div className="flex items-center gap-3">
                  <ProgressRing value={area.avgProgress} size={44} stroke={5} color={area.color}>
                    <span className="text-[11px] font-bold">{Math.round(area.avgProgress * 100)}</span>
                  </ProgressRing>
                  <div className="min-w-0">
                    <CardTitle>{area.name}</CardTitle>
                    <p className="text-xs text-muted-2">
                      {area.results.length} {plural(area.results.length, "результат", "результата", "результатов")}
                      {spentIn(area.id) > 0 && ` · ${formatMinor(spentIn(area.id), currency)} за месяц`}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  {area.results.map((r) => (
                    <ResultRow key={r.id} r={r} accent={area.color} />
                  ))}
                </div>
              </Card>
            </RevealItem>
          ))}
        </RevealList>
      )}

      {(money.areas.length > 0 || money.unmappedMinor > 0) && (
        <Reveal className="mt-4">
          <Card>
            <CardTitle className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Куда уходят деньги в этом месяце
            </CardTitle>

            {money.areas.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Ни одна категория трат пока не связана со сферой жизни. Настройки → «Траты и сферы
                жизни».
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {money.areas.map((a) => {
                  const area = state.lifeAreas.find((x) => x.id === a.areaId);
                  return (
                    <div key={a.areaId}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{area?.name ?? "Сфера"}</span>
                        <span className="text-[11px] text-muted-2">{Math.round(a.share * 100)}%</span>
                        <span className="font-bold tabular-nums">
                          {formatMinor(a.amountMinor, currency)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full w-full origin-left rounded-full"
                          style={{
                            backgroundColor: area?.color ?? "var(--primary)",
                            transform: `scaleX(${a.share})`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {money.unmappedMinor > 0 && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                Не распределено по сферам: {formatMinor(money.unmappedMinor, currency)} — у этих
                категорий сфера не выбрана.
              </p>
            )}
          </Card>
        </Reveal>
      )}
    </div>
  );
}

function ResultRow({ r, accent }: { r: GoalTreeResult; accent: string }) {
  return (
    <div className="rounded-[var(--r)] bg-surface-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge color={accent}>{r.kind === "goal" ? "Цель" : "Проект"}</Badge>
            <span className="text-[11px] text-muted-2">
              {FOCUS_ZONE_LABELS[r.zone as never] ?? r.zone}
              {r.horizonDays ? ` · ${r.horizonDays} дн.` : ""}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs font-bold text-muted">{Math.round(r.progress * 100)}%</span>
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${r.progress * 100}%`, backgroundColor: accent }}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 text-xs">
        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-2" />
        {r.nextActionTitle ? (
          <span className="truncate text-foreground">{r.nextActionTitle}</span>
        ) : (
          <span style={{ color: "color-mix(in oklab, var(--attention) 60%, var(--foreground))" }}>ближайшее действие не задано</span>
        )}
      </div>

      {r.taskCount > 0 && (
        <p className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-2">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-[var(--resource)]" /> {r.doneCount}
          </span>
          <span className="flex items-center gap-1">
            <CircleDashed className="h-3 w-3" /> {r.taskCount - r.doneCount} в работе
          </span>
        </p>
      )}
    </div>
  );
}
