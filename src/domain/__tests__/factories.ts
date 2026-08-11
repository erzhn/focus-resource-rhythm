import type { DayResources, DomainTask, Scale1to5 } from "@/domain/types";

/** Фабрика доменной задачи с разумными значениями по умолчанию для тестов. */
export function makeTask(overrides: Partial<DomainTask> = {}): DomainTask {
  return {
    id: overrides.id ?? "t1",
    title: overrides.title ?? "Задача",
    status: overrides.status ?? "planned",
    dueDate: overrides.dueDate ?? null,
    importance: (overrides.importance ?? 3) as Scale1to5,
    consequence: (overrides.consequence ?? 3) as Scale1to5,
    goalLink: (overrides.goalLink ?? 3) as Scale1to5,
    energyRequired: (overrides.energyRequired ?? 3) as Scale1to5,
    plannedMinutes: overrides.plannedMinutes ?? 30,
    plannedMoneyMinor: overrides.plannedMoneyMinor ?? 0,
    schedulingMode: overrides.schedulingMode ?? "unordered",
    isRecurringToday: overrides.isRecurringToday ?? false,
    unblocks: overrides.unblocks ?? [],
    dependsOn: overrides.dependsOn ?? [],
    linkedToActiveResult: overrides.linkedToActiveResult ?? false,
  };
}

export function makeResources(overrides: Partial<DayResources> = {}): DayResources {
  return {
    availableMinutes: overrides.availableMinutes ?? 480,
    energyLevel: (overrides.energyLevel ?? 3) as Scale1to5,
    moneyLimitMinor: overrides.moneyLimitMinor ?? null,
    reserveRatio: overrides.reserveRatio ?? 0.25,
  };
}
