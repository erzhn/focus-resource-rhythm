"use client";

import { FOCUS_ZONE_LABELS } from "@/domain/focus";
import { useStore } from "@/lib/demo/store";
import { Card, CardTitle } from "@/components/ui/primitives";

export default function GoalsPage() {
  const { state } = useStore();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Цели и проекты</h1>
        <p className="mt-1 text-sm text-muted">
          Цепочка: Сфера жизни → Цель / Проект → Задача → Ближайшее действие.
        </p>
      </header>

      {state.lifeAreas.map((area) => {
        const results = state.results.filter((r) => r.lifeAreaId === area.id);
        if (results.length === 0) return null;
        return (
          <Card key={area.id}>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: area.color }} />
              <CardTitle>{area.name}</CardTitle>
            </div>
            <div className="mt-3 space-y-3">
              {results.map((r) => {
                const tasks = state.tasks.filter((t) => t.resultId === r.id);
                const nextAction = tasks.find((t) => t.status !== "done" && t.status !== "cancelled");
                return (
                  <div key={r.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{r.title}</p>
                      <span className="text-[11px] text-muted">
                        {r.kind === "goal" ? "Цель" : "Проект"} · {FOCUS_ZONE_LABELS[r.zone]}
                        {r.horizonDays ? ` · ${r.horizonDays} дн.` : ""}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${r.progress * 100}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Ближайшее действие:{" "}
                      {nextAction ? (
                        <span className="text-foreground">{nextAction.title}</span>
                      ) : (
                        <span className="text-[var(--warning)]">не задано</span>
                      )}
                    </p>
                    {tasks.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted">Задач привязано: {tasks.length}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
