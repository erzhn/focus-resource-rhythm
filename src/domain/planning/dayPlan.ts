import { METHOD } from "@/config/app";
import { calculatePriority, isBlocked, type PriorityContext } from "@/domain/priority";
import { plannableMinutes, reserveMinutes } from "@/domain/resources";
import type { DayResources, DomainTask } from "@/domain/types";

export interface PlannedTask {
  task: DomainTask;
  score: number;
  explanation: string;
  warnings: string[];
}

export interface DayPlanDraft {
  /** Одно главное дело. */
  main: PlannedTask | null;
  /** До двух дополнительных задач. */
  secondary: PlannedTask[];
  /** Обязательные повторяющиеся дела (не считаются в лимите 1+2). */
  recurring: PlannedTask[];
  /** Рекомендуемый порядок выполнения. */
  order: PlannedTask[];
  /** Минуты резерва времени. */
  reserveMinutes: number;
  /** Запланированные минуты (сумма выбранных задач). */
  plannedMinutes: number;
  /** Минуты, доступные под планирование (после вычета резерва). */
  plannableMinutes: number;
  /** Задачи, исключённые как заблокированные зависимостью. */
  blocked: DomainTask[];
  /** Предупреждения о конфликтах и перегрузке. */
  warnings: string[];
}

/**
 * Формирует черновик плана дня из списка задач-кандидатов.
 * План остаётся черновиком: система рекомендует, но ничего не назначает окончательно.
 */
export function buildDayPlan(
  candidates: readonly DomainTask[],
  resources: DayResources,
  ctx: PriorityContext,
): DayPlanDraft {
  const reserve = reserveMinutes(resources.availableMinutes, resources.reserveRatio);
  const budget = plannableMinutes(resources.availableMinutes, resources.reserveRatio);
  const warnings: string[] = [];

  const active = candidates.filter(
    (t) => t.status !== "done" && t.status !== "cancelled" && t.status !== "postponed",
  );

  const blocked = active.filter((t) => isBlocked(t, ctx.completedTaskIds));
  const schedulable = active.filter((t) => !isBlocked(t, ctx.completedTaskIds));

  const toPlanned = (t: DomainTask): PlannedTask => {
    const p = calculatePriority(t, ctx);
    return { task: t, score: p.score, explanation: p.explanation, warnings: p.resourceWarnings };
  };

  // Обязательные повторяющиеся дела включаются всегда, но занимают время.
  const recurring = schedulable.filter((t) => t.isRecurringToday).map(toPlanned);
  let usedMinutes = recurring.reduce((s, p) => s + p.task.plannedMinutes, 0);

  // Остальные задачи ранжируем по приоритету.
  const ranked = schedulable
    .filter((t) => !t.isRecurringToday)
    .map(toPlanned)
    .sort((a, b) => b.score - a.score);

  const fits = (p: PlannedTask) => usedMinutes + p.task.plannedMinutes <= budget;
  const noteEnergy = (p: PlannedTask) => {
    if (p.task.energyRequired > resources.energyLevel) {
      warnings.push(
        `«${p.task.title}» требует больше сил, чем есть сейчас — включена с предупреждением.`,
      );
    }
  };

  let main: PlannedTask | null = null;
  const secondary: PlannedTask[] = [];

  for (const p of ranked) {
    if (!main) {
      // Главное дело выбирается всегда (высший приоритет), даже если оно велико —
      // перегрузка не скрывается, а показывается предупреждением ниже.
      main = p;
      usedMinutes += p.task.plannedMinutes;
      noteEnergy(p);
      if (p.task.plannedMinutes > budget) {
        warnings.push("Главное дело не помещается в доступное время — рассмотрите разбиение или перенос части задач.");
      }
      continue;
    }
    if (secondary.length >= METHOD.maxSecondaryTasksPerDay) break;
    if (fits(p)) {
      secondary.push(p);
      usedMinutes += p.task.plannedMinutes;
      noteEnergy(p);
    }
  }

  if (usedMinutes > budget) {
    warnings.push(
      `Перегрузка: запланировано ${usedMinutes} мин при доступных под планирование ${budget} мин.`,
    );
  }

  const order = [...recurring, ...(main ? [main] : []), ...secondary].sort(
    (a, b) => b.score - a.score,
  );

  return {
    main,
    secondary,
    recurring,
    order,
    reserveMinutes: reserve,
    plannedMinutes: usedMinutes,
    plannableMinutes: budget,
    blocked,
    warnings,
  };
}
