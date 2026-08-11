"use client";

import { useStore } from "@/lib/demo/store";
import { Card, CardTitle } from "@/components/ui/primitives";
import { formatMinutes } from "@/lib/format";

export default function StatsPage() {
  const { state } = useStore();
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const completion = total === 0 ? 0 : Math.round((done / total) * 100);
  const plannedMinutes = state.tasks.reduce((s, t) => s + t.plannedMinutes, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Статистика</h1>
        <p className="mt-1 text-sm text-muted">Показатели, помогающие принимать решения.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Выполнение</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{completion}%</p>
          <p className="text-xs text-muted">{done} из {total} задач</p>
        </Card>
        <Card>
          <CardTitle>Плановое время</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{formatMinutes(plannedMinutes)}</p>
          <p className="text-xs text-muted">по всем задачам</p>
        </Card>
        <Card>
          <CardTitle>Активных результатов</CardTitle>
          <p className="mt-2 text-2xl font-semibold">
            {state.results.filter((r) => r.zone === "now").length} / 3
          </p>
          <p className="text-xs text-muted">в зоне «Сейчас»</p>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardTitle>Ещё появится</CardTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Процент выполнения по дням и неделям, план/факт времени и денег.</li>
          <li>Динамика утреннего и вечернего уровня сил.</li>
          <li>Количество и причины переносов, точность оценок длительности.</li>
          <li>Распределение нагрузки по сферам жизни и соблюдение резерва.</li>
        </ul>
      </Card>
    </div>
  );
}
