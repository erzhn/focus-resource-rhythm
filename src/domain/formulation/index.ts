/**
 * Помощник формулировки задачи.
 *
 * Работает без внешнего LLM: детерминированный шаблонный помощник.
 * Дополнительный AI-провайдер можно подключить позже через серверный адаптер,
 * реализующий тот же интерфейс `TaskFormulationService`; отсутствие ключа
 * не ломает основной сценарий.
 */
export interface FormulationInput {
  title: string;
  description?: string | null;
  plannedMinutes?: number | null;
  dueDate?: Date | null;
  energyRequired?: number | null;
}

export interface FormulationSuggestion {
  improvedTitle: string;
  desiredResult: string;
  completionCriterion: string;
  nextPhysicalAction: string;
  realisticDueHint: string;
  resourceHint: string;
  /** Пометка, что подсказка сгенерирована шаблонным помощником, а не ИИ. */
  source: "template" | "ai";
}

export interface TaskFormulationService {
  suggest(input: FormulationInput): FormulationSuggestion;
}

/** Глаголы действия — по ним определяем, начинается ли задача с конкретного действия. */
const ACTION_VERBS = [
  "сделать", "написать", "позвонить", "отправить", "подготовить", "составить",
  "купить", "заказать", "прочитать", "изучить", "встретиться", "оформить",
  "проверить", "настроить", "создать", "закончить", "начать", "собрать",
];

const startsWithAction = (title: string) =>
  ACTION_VERBS.some((v) => title.trim().toLowerCase().startsWith(v));

export class TemplateFormulationService implements TaskFormulationService {
  suggest(input: FormulationInput): FormulationSuggestion {
    const clean = input.title.trim().replace(/\s+/g, " ");
    const lower = clean.toLowerCase();

    const improvedTitle = startsWithAction(clean)
      ? clean
      : `Подготовить: ${clean}`;

    const desiredResult = input.description?.trim()
      ? `Ожидаемый результат: ${input.description.trim()}`
      : `Сформулируйте конкретный результат для «${clean}»: что именно должно быть готово?`;

    const completionCriterion =
      `Задача выполнена, когда есть проверяемый признак результата по «${clean}» ` +
      `(файл, сообщение, договорённость, оплата или иной артефакт).`;

    const nextPhysicalAction = startsWithAction(clean)
      ? `Первый шаг: выполнить действие «${clean}» в ближайшем свободном окне.`
      : `Ближайшее физическое действие: открыть материалы и сделать первый маленький шаг по «${lower}».`;

    const realisticDueHint = input.dueDate
      ? "Проверьте, реалистичен ли срок при текущих ресурсах; при сомнении перенесите в «Следом»."
      : "Срок не задан. Назначьте реалистичную дату или оставьте задачу в «Позже».";

    const minutes = input.plannedMinutes ?? null;
    const resourceHint =
      (minutes && minutes > 90
        ? "Оценка больше 90 минут — стоит разбить задачу на части. "
        : "") +
      "Уточните нужные время, силы и деньги, чтобы задача поместилась в день.";

    return {
      improvedTitle,
      desiredResult,
      completionCriterion,
      nextPhysicalAction,
      realisticDueHint,
      resourceHint,
      source: "template",
    };
  }
}

/** Экземпляр по умолчанию. */
export const formulationService: TaskFormulationService = new TemplateFormulationService();
