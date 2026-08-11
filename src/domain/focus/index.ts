import { METHOD } from "@/config/app";
import { FOCUS_ZONE_LABELS, type FocusZone } from "@/domain/types";

export { FOCUS_ZONE_LABELS };
export type { FocusZone };

/** Крупный результат (цель/проект) с точки зрения зон фокуса. */
export interface FocusResult {
  id: string;
  title: string;
  zone: FocusZone;
  /** Есть ли у активного результата ближайшее физическое действие. */
  hasNextAction: boolean;
}

/** Варианты, которые система предлагает, когда зона «Сейчас» переполнена. */
export type OverflowActionKind = "complete" | "pause" | "move_next" | "cancel";

export interface OverflowOption {
  kind: OverflowActionKind;
  label: string;
  /** id результата, к которому применяется действие. */
  resultId: string;
  resultTitle: string;
}

export interface AddToNowCheck {
  allowed: boolean;
  /** Текущее число активных результатов. */
  activeCount: number;
  limit: number;
  /** Если запрещено — конкретные варианты освободить место. */
  options: OverflowOption[];
  message: string;
}

/** Число активных крупных результатов (зона «Сейчас»). */
export function countActive(results: readonly FocusResult[]): number {
  return results.filter((r) => r.zone === "now").length;
}

/**
 * Можно ли добавить ещё один крупный результат в зону «Сейчас».
 * Если лимит исчерпан — возвращает варианты: завершить, приостановить,
 * перенести в «Следом» или отменить один из текущих. Ничего не делает автоматически.
 */
export function canAddToNow(results: readonly FocusResult[]): AddToNowCheck {
  const active = results.filter((r) => r.zone === "now");
  const limit = METHOD.maxActiveResults;
  if (active.length < limit) {
    return {
      allowed: true,
      activeCount: active.length,
      limit,
      options: [],
      message: `Можно добавить: в «Сейчас» ${active.length} из ${limit}.`,
    };
  }

  const options: OverflowOption[] = active.flatMap((r) => [
    { kind: "complete" as const, label: "Завершить", resultId: r.id, resultTitle: r.title },
    { kind: "pause" as const, label: "Приостановить", resultId: r.id, resultTitle: r.title },
    { kind: "move_next" as const, label: "Перенести в «Следом»", resultId: r.id, resultTitle: r.title },
    { kind: "cancel" as const, label: "Отменить", resultId: r.id, resultTitle: r.title },
  ]);

  return {
    allowed: false,
    activeCount: active.length,
    limit,
    options,
    message: `В «Сейчас» уже ${limit} активных результата. Освободите фокус: завершите, приостановите, перенесите или отмените один из них.`,
  };
}

/** Активные результаты без ближайшего действия — нарушение правила методики. */
export function activeWithoutNextAction(results: readonly FocusResult[]): FocusResult[] {
  return results.filter((r) => r.zone === "now" && !r.hasNextAction);
}
