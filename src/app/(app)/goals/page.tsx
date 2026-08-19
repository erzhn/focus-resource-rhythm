"use client";

import { Target, CornerDownRight, CheckCircle2, CircleDashed } from "lucide-react";
import { FOCUS_ZONE_LABELS } from "@/domain/focus";
import { useStore } from "@/lib/demo/store";
import { buildGoalTree, type GoalTreeResult } from "@/lib/ui/goal-tree";
import { plural } from "@/lib/ui/text";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Reveal, RevealList, RevealItem } from "@/components/ui/reveal";
import { Card, CardTitle, EmptyState, Badge } from "@/components/ui/primitives";

export default function GoalsPage() {
  const { state } = useStore();
  const tree = buildGoalTree(state.lifeAreas, state.results, state.tasks);

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
          <span className="text-[var(--attention)]">ближайшее действие не задано</span>
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
