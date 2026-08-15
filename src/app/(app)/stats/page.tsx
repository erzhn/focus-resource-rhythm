"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/lib/demo/store";
import { Card, CardTitle } from "@/components/ui/primitives";
import { formatMinutes } from "@/lib/format";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/domain/types";

const STATUS_COLORS: Partial<Record<TaskStatus, string>> = {
  done: "#2f7d4f",
  in_progress: "#3b6ea5",
  planned: "#8a7a3a",
  partial: "#b5892f",
  postponed: "#8a8a85",
  cancelled: "#b4432f",
  inbox: "#6b6b66",
};

export default function StatsPage() {
  const { state, priorityOf } = useStore();

  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const completion = total === 0 ? 0 : Math.round((done / total) * 100);

  // Разбивка по статусам
  const statusData = (Object.keys(TASK_STATUS_LABELS) as TaskStatus[])
    .map((s) => ({ status: s, name: TASK_STATUS_LABELS[s], value: state.tasks.filter((t) => t.status === s).length }))
    .filter((d) => d.value > 0);

  // Нагрузка по сферам жизни (плановые минуты)
  const areaById = new Map(state.lifeAreas.map((a) => [a.id, a]));
  const resultArea = new Map(state.results.map((r) => [r.id, r.lifeAreaId]));
  const loadMap = new Map<string, number>();
  for (const t of state.tasks) {
    const areaId = t.resultId ? resultArea.get(t.resultId) ?? null : null;
    const key = areaId ?? "none";
    loadMap.set(key, (loadMap.get(key) ?? 0) + t.plannedMinutes);
  }
  const areaLoad = [...loadMap.entries()].map(([key, minutes]) => ({
    name: key === "none" ? "Без сферы" : areaById.get(key)?.name ?? key,
    color: key === "none" ? "#6b6b66" : areaById.get(key)?.color ?? "#888",
    minutes,
  }));

  // Распределение приоритета
  const buckets = [
    { name: "Низкий (0–39)", range: [0, 39], color: "#6b6b66" },
    { name: "Средний (40–69)", range: [40, 69], color: "#b5892f" },
    { name: "Высокий (70–100)", range: [70, 100], color: "#b4432f" },
  ];
  const priorityDist = buckets.map((b) => ({
    name: b.name,
    color: b.color,
    value: state.tasks.filter((t) => {
      const s = priorityOf(t).effectiveScore;
      return s >= b.range[0] && s <= b.range[1];
    }).length,
  }));

  const plannedTotal = state.tasks.reduce((s, t) => s + t.plannedMinutes, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Статистика</h1>
        <p className="mt-1 text-sm text-muted">Показатели помогают принять решение, а не украшают экран.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Выполнение</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{completion}%</p>
          <p className="text-xs text-muted">{done} из {total} задач</p>
        </Card>
        <Card>
          <CardTitle>Плановое время</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{formatMinutes(plannedTotal)}</p>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Задачи по статусам</CardTitle>
          <div className="mt-2 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {statusData.map((d) => (
                    <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "#888"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Текстовая альтернатива */}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            {statusData.map((d) => (
              <li key={d.status} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.status] }} />
                {d.name}: {d.value}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>Нагрузка по сферам жизни (мин)</CardTitle>
          <div className="mt-2 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaLoad}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <Tooltip formatter={(v) => `${v} мин`} />
                <Bar dataKey="minutes">
                  {areaLoad.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {areaLoad.map((d) => `${d.name}: ${formatMinutes(d.minutes)}`).join(" · ")}
          </p>
        </Card>

        <Card>
          <CardTitle>Распределение приоритета</CardTitle>
          <div className="mt-2 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityDist}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <Tooltip />
                <Bar dataKey="value">
                  {priorityDist.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {priorityDist.map((d) => `${d.name}: ${d.value}`).join(" · ")}
          </p>
        </Card>

        <Card>
          <CardTitle>Уровень сил</CardTitle>
          <div className="mt-3 space-y-3">
            <EnergyBar label="Утро" value={state.morningEnergy} />
            <EnergyBar label="Вечер" value={state.eveningEnergy} />
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Резерв времени: {Math.round(state.reserveRatio * 100)}%. Соблюдение резерва и точность
            оценок появятся с накоплением истории (после подключения БД).
          </p>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardTitle>Появится с историей данных</CardTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Процент выполнения по дням и неделям; план/факт времени и денег.</li>
          <li>Динамика утреннего/вечернего уровня сил во времени.</li>
          <li>Количество и причины переносов; точность первоначальной оценки длительности.</li>
          <li>Дни перегрузки и соблюдение резерва.</li>
        </ul>
      </Card>
    </div>
  );
}

function EnergyBar({ label, value }: { label: string; value: number | null }) {
  const pct = value ? (value / 5) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">{value ? `${value} из 5` : "нет отметки"}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--energy-high)" }} />
      </div>
    </div>
  );
}
