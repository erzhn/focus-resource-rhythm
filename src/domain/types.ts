/**
 * Доменные типы методики «Фокус — Ресурс — Ритм».
 * Эти типы независимы от базы данных и UI — их использует чистая доменная логика.
 */

/** Статусы задачи. */
export type TaskStatus =
  | "inbox" // входящие
  | "planned" // запланирована
  | "in_progress" // в работе
  | "done" // выполнена
  | "partial" // выполнена частично
  | "postponed" // перенесена
  | "cancelled"; // отменена

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Входящие",
  planned: "Запланирована",
  in_progress: "В работе",
  done: "Выполнена",
  partial: "Выполнена частично",
  postponed: "Перенесена",
  cancelled: "Отменена",
};

/** Зоны фокуса для крупных результатов (целей/проектов). */
export type FocusZone = "now" | "next" | "later" | "declined";

export const FOCUS_ZONE_LABELS: Record<FocusZone, string> = {
  now: "Сейчас",
  next: "Следом",
  later: "Позже",
  declined: "Отказ",
};

/** Шкала 1–5 для важности, последствий, связи с целью, уровня сил. */
export type Scale1to5 = 1 | 2 | 3 | 4 | 5;

/** Способ размещения задачи в дне. */
export type SchedulingMode =
  | "unordered" // без точного времени
  | "ordered" // по порядку
  | "timeblock"; // временным блоком

/** Уровень сил в упрощённом интерфейсе. */
export type EnergyBand = "low" | "medium" | "high";

/** Задача в том виде, в котором её понимает доменная логика (без полей БД). */
export interface DomainTask {
  id: string;
  title: string;
  status: TaskStatus;
  /** Срок (дата, в часовом поясе пользователя). null — без срока. */
  dueDate: Date | null;
  importance: Scale1to5;
  /** Последствия невыполнения. */
  consequence: Scale1to5;
  /** Связь с активной главной целью/результатом. */
  goalLink: Scale1to5;
  /** Требуемый уровень сил. */
  energyRequired: Scale1to5;
  /** Плановое время, минуты. */
  plannedMinutes: number;
  /** Плановая сумма денег (в минимальных единицах — тыйынах — чтобы избежать float). */
  plannedMoneyMinor: number;
  schedulingMode: SchedulingMode;
  /** Является ли обязательным повторяющимся делом на сегодня. */
  isRecurringToday: boolean;
  /** id задач, которые эта задача разблокирует (для которых она — зависимость). */
  unblocks: string[];
  /** id задач, от которых зависит эта (должны быть выполнены раньше). */
  dependsOn: string[];
  /** Привязана ли задача к результату/цели в зоне «Сейчас». */
  linkedToActiveResult: boolean;
}

/** Доступные ресурсы дня. */
export interface DayResources {
  /** Доступное время в минутах (до вычета резерва). */
  availableMinutes: number;
  /** Текущий уровень сил пользователя. */
  energyLevel: Scale1to5;
  /** Дневной денежный лимит в минимальных единицах. null — без лимита. */
  moneyLimitMinor: number | null;
  /** Доля резерва времени (0.2–0.3). */
  reserveRatio: number;
}
