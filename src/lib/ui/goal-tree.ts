/** Чистое построение дерева «Сфера → Цель/Проект → Задача → Ближайшее действие». */

interface AreaLike {
  id: string;
  name: string;
  color: string;
}
interface ResultLike {
  id: string;
  title: string;
  kind: "goal" | "project";
  zone: string;
  progress: number;
  horizonDays?: number | null;
  lifeAreaId: string | null;
}
interface TaskLike {
  id: string;
  title: string;
  status: string;
  resultId?: string | null;
}

export interface GoalTreeResult {
  id: string;
  title: string;
  kind: "goal" | "project";
  zone: string;
  progress: number;
  horizonDays: number | null;
  taskCount: number;
  doneCount: number;
  nextActionTitle: string | null;
}

export interface GoalTreeArea {
  id: string;
  name: string;
  color: string;
  results: GoalTreeResult[];
  /** Средний прогресс по результатам сферы (0..1). */
  avgProgress: number;
}

const ACTIVE = (status: string) => status !== "done" && status !== "cancelled";

/** Собирает только непустые сферы (с хотя бы одним результатом). */
export function buildGoalTree(
  areas: AreaLike[],
  results: ResultLike[],
  tasks: TaskLike[],
): GoalTreeArea[] {
  const out: GoalTreeArea[] = [];
  for (const area of areas) {
    const areaResults = results.filter((r) => r.lifeAreaId === area.id);
    if (areaResults.length === 0) continue;

    const treeResults: GoalTreeResult[] = areaResults.map((r) => {
      const rTasks = tasks.filter((t) => t.resultId === r.id);
      const nextAction = rTasks.find((t) => ACTIVE(t.status));
      return {
        id: r.id,
        title: r.title,
        kind: r.kind,
        zone: r.zone,
        progress: r.progress,
        horizonDays: r.horizonDays ?? null,
        taskCount: rTasks.length,
        doneCount: rTasks.filter((t) => t.status === "done").length,
        nextActionTitle: nextAction ? nextAction.title : null,
      };
    });

    const avgProgress =
      treeResults.reduce((s, r) => s + r.progress, 0) / treeResults.length;

    out.push({ id: area.id, name: area.name, color: area.color, results: treeResults, avgProgress });
  }
  return out;
}
