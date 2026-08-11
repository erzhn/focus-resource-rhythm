import { differenceInCalendarDays } from "date-fns";
import type { DayResources, DomainTask } from "@/domain/types";
import {
  PRIORITY_MAX,
  PRIORITY_WEIGHTS,
  RESOURCE_FIT_SPLIT,
  UNBLOCK_POINTS_PER_TASK,
  URGENCY_HORIZON_DAYS,
} from "./weights";

export interface PriorityFactor {
  key: string;
  /** Человекочитаемое название фактора. */
  label: string;
  /** Фактически начисленные баллы. */
  points: number;
  /** Максимум для этого фактора. */
  max: number;
  /** Короткое объяснение, почему начислено столько. */
  reason: string;
}

export interface PriorityResult {
  /** Итоговый системный балл 0–100. */
  score: number;
  factors: PriorityFactor[];
  /** Заблокирована ли задача незавершённой зависимостью. */
  blocked: boolean;
  /** Предупреждения о несоответствии ресурсам (не убирают задачу, а объясняют риск). */
  resourceWarnings: string[];
  /** Краткое объяснение человеческим языком. */
  explanation: string;
}

export interface PriorityContext {
  /** Текущая дата в часовом поясе пользователя. */
  now: Date;
  resources: DayResources;
  /** id уже выполненных задач — для определения заблокированности. */
  completedTaskIds: ReadonlySet<string>;
}

const clampPoints = (v: number, max: number) =>
  Math.max(0, Math.min(max, Math.round(v)));

/** Баллы за важность (линейно 1..5 → 5..25). */
function importancePoints(task: DomainTask): PriorityFactor {
  const points = clampPoints(
    (task.importance / 5) * PRIORITY_WEIGHTS.importance,
    PRIORITY_WEIGHTS.importance,
  );
  return {
    key: "importance",
    label: "Важность",
    points,
    max: PRIORITY_WEIGHTS.importance,
    reason: `Важность ${task.importance} из 5`,
  };
}

/** Баллы за срочность/близость срока. Срок сегодня или в прошлом даёт максимум. */
function urgencyPoints(task: DomainTask, now: Date): PriorityFactor {
  const max = PRIORITY_WEIGHTS.urgency;
  if (!task.dueDate) {
    return { key: "urgency", label: "Срочность", points: 0, max, reason: "Без срока" };
  }
  const daysUntil = differenceInCalendarDays(task.dueDate, now);
  let points: number;
  let reason: string;
  if (daysUntil <= 0) {
    points = max;
    reason = daysUntil === 0 ? "Срок сегодня" : "Срок уже наступил";
  } else if (daysUntil >= URGENCY_HORIZON_DAYS) {
    points = 0;
    reason = `Срок через ${daysUntil} дн.`;
  } else {
    points = clampPoints(max * (1 - daysUntil / URGENCY_HORIZON_DAYS), max);
    reason = daysUntil === 1 ? "Срок завтра" : `Срок через ${daysUntil} дн.`;
  }
  return { key: "urgency", label: "Срочность", points, max, reason };
}

/** Баллы за последствия невыполнения. */
function consequencePoints(task: DomainTask): PriorityFactor {
  const points = clampPoints(
    (task.consequence / 5) * PRIORITY_WEIGHTS.consequence,
    PRIORITY_WEIGHTS.consequence,
  );
  return {
    key: "consequence",
    label: "Последствия невыполнения",
    points,
    max: PRIORITY_WEIGHTS.consequence,
    reason: `Последствия ${task.consequence} из 5`,
  };
}

/** Баллы за связь с активной целью/результатом. */
function goalLinkPoints(task: DomainTask): PriorityFactor {
  const max = PRIORITY_WEIGHTS.goalLink;
  let points = (task.goalLink / 5) * max;
  // Привязка к активному результату («Сейчас») гарантирует минимум 60% веса.
  if (task.linkedToActiveResult) points = Math.max(points, max * 0.6);
  return {
    key: "goalLink",
    label: "Связь с активной целью",
    points: clampPoints(points, max),
    max,
    reason: task.linkedToActiveResult
      ? "Связана с активным результатом «Сейчас»"
      : `Связь с целью ${task.goalLink} из 5`,
  };
}

/** Баллы за разблокирование других задач. */
function unblockPoints(task: DomainTask): PriorityFactor {
  const max = PRIORITY_WEIGHTS.unblock;
  const count = task.unblocks.length;
  const points = clampPoints(count * UNBLOCK_POINTS_PER_TASK, max);
  return {
    key: "unblock",
    label: "Разблокирует другие задачи",
    points,
    max,
    reason: count > 0 ? `Разблокирует задач: ${count}` : "Ничего не разблокирует",
  };
}

/** Проверка соответствия ресурсам: даёт баллы и накапливает предупреждения. */
function resourceFit(
  task: DomainTask,
  resources: DayResources,
): { factor: PriorityFactor; warnings: string[] } {
  const warnings: string[] = [];
  let points = 0;

  const availableAfterReserve = Math.round(
    resources.availableMinutes * (1 - resources.reserveRatio),
  );
  if (task.plannedMinutes <= availableAfterReserve) {
    points += RESOURCE_FIT_SPLIT.time;
  } else {
    warnings.push(
      `Не помещается по времени: нужно ${task.plannedMinutes} мин, доступно с учётом резерва ${availableAfterReserve} мин`,
    );
  }

  if (task.energyRequired <= resources.energyLevel) {
    points += RESOURCE_FIT_SPLIT.energy;
  } else {
    warnings.push(
      `Требует больше сил (${task.energyRequired} из 5), чем есть сейчас (${resources.energyLevel} из 5)`,
    );
  }

  if (resources.moneyLimitMinor === null || task.plannedMoneyMinor <= resources.moneyLimitMinor) {
    points += RESOURCE_FIT_SPLIT.money;
  } else {
    warnings.push("Плановая сумма превышает дневной денежный лимит");
  }

  return {
    factor: {
      key: "resourceFit",
      label: "Соответствие ресурсам",
      points,
      max: PRIORITY_WEIGHTS.resourceFit,
      reason: warnings.length === 0 ? "Помещается в доступные ресурсы" : "Есть ограничения по ресурсам",
    },
    warnings,
  };
}

/** Дополнительные баллы за просрочку (1 балл за день, максимум 5). */
function overduePoints(task: DomainTask, now: Date): PriorityFactor {
  const max = PRIORITY_WEIGHTS.overdue;
  if (!task.dueDate) {
    return { key: "overdue", label: "Просрочка", points: 0, max, reason: "Не просрочена" };
  }
  const daysOverdue = differenceInCalendarDays(now, task.dueDate);
  const points = daysOverdue > 0 ? clampPoints(daysOverdue, max) : 0;
  return {
    key: "overdue",
    label: "Просрочка",
    points,
    max,
    reason: daysOverdue > 0 ? `Просрочена на ${daysOverdue} дн.` : "Не просрочена",
  };
}

/** Определяет, заблокирована ли задача незавершённой зависимостью. */
export function isBlocked(task: DomainTask, completed: ReadonlySet<string>): boolean {
  return task.dependsOn.some((depId) => !completed.has(depId));
}

/** Собирает короткое объяснение из самых значимых факторов. */
function buildExplanation(
  score: number,
  factors: PriorityFactor[],
  blocked: boolean,
): string {
  if (blocked) {
    return "Заблокирована: сначала нужно завершить задачу-зависимость. Не рекомендуется к выполнению.";
  }
  const top = [...factors]
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((f) => f.reason.toLowerCase());

  const level =
    score >= 70 ? "Высокий приоритет" : score >= 40 ? "Средний приоритет" : "Низкий приоритет";

  return top.length > 0 ? `${level}: ${top.join(", ")}.` : `${level}.`;
}

/**
 * Рассчитывает объяснимый приоритет задачи 0–100.
 * Детерминированная функция: одинаковый вход всегда даёт одинаковый результат.
 */
export function calculatePriority(task: DomainTask, ctx: PriorityContext): PriorityResult {
  const { factor: fitFactor, warnings } = resourceFit(task, ctx.resources);

  const factors: PriorityFactor[] = [
    importancePoints(task),
    urgencyPoints(task, ctx.now),
    consequencePoints(task),
    goalLinkPoints(task),
    unblockPoints(task),
    fitFactor,
    overduePoints(task, ctx.now),
  ];

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.min(PRIORITY_MAX, raw);
  const blocked = isBlocked(task, ctx.completedTaskIds);

  return {
    score,
    factors,
    blocked,
    resourceWarnings: warnings,
    explanation: buildExplanation(score, factors, blocked),
  };
}
