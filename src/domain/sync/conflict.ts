/**
 * Разрешение конфликтов двусторонней синхронизации календарей.
 * Чистая, детерминированная и тестируемая логика (ТЗ §12.3).
 *
 * Ключевое правило: внешнюю версию НЕ применяем молча. Если изменение пришло
 * извне (или невозможно надёжно определить более позднюю версию), создаём запрос
 * подтверждения. Локальные изменения остаются и отправляются наружу.
 */

export type SyncChangeType = "update" | "delete";

export interface SyncConflictInput {
  changeType: SyncChangeType;
  /** Время последнего локального изменения. */
  localUpdatedAt: Date | null;
  /** Время внешнего изменения (updated / lastModifiedDateTime). */
  externalUpdatedAt: Date | null;
  /** Время последней успешной синхронизации записи. */
  lastSyncedAt: Date | null;
}

export type SyncDecision = "keep_local" | "ask";

export interface SyncResolution {
  decision: SyncDecision;
  reason: string;
}

const changedSince = (at: Date | null, since: Date | null): boolean => {
  if (!at) return false;
  if (!since) return true;
  return at.getTime() > since.getTime();
};

/**
 * Возвращает решение по входящему изменению.
 * - Удаление извне всегда требует подтверждения.
 * - Любое обновление извне → подтверждение (не применяем молча), с пометкой,
 *   есть ли одновременно локальные изменения (конфликт) и какая версия новее.
 * - Если извне ничего не менялось → сохраняем локальную версию.
 */
export function resolveSyncConflict(input: SyncConflictInput): SyncResolution {
  const { changeType, localUpdatedAt, externalUpdatedAt, lastSyncedAt } = input;

  if (changeType === "delete") {
    return { decision: "ask", reason: "Внешнее удаление требует подтверждения." };
  }

  const externalChanged = changedSince(externalUpdatedAt, lastSyncedAt);
  const localChanged = changedSince(localUpdatedAt, lastSyncedAt);

  if (!externalChanged) {
    return { decision: "keep_local", reason: "Внешних изменений нет — сохраняем локальную версию." };
  }

  // Извне пришло изменение — молча не применяем.
  if (localChanged) {
    if (!localUpdatedAt || !externalUpdatedAt) {
      return {
        decision: "ask",
        reason: "Изменено с обеих сторон, версию определить нельзя — показать обе версии.",
      };
    }
    const newer = externalUpdatedAt > localUpdatedAt ? "внешняя" : "локальная";
    return {
      decision: "ask",
      reason: `Конфликт: изменено с обеих сторон, новее ${newer} версия — требуется решение.`,
    };
  }

  return {
    decision: "ask",
    reason: "Пришло внешнее изменение — подтвердите применение (сравнение «было/стало»).",
  };
}

/**
 * Идемпотентность: обработчик не должен применять одну и ту же операцию дважды.
 * Возвращает true, если операция уже применялась.
 */
export function isDuplicateOperation(
  incomingOperationId: string | null,
  lastAppliedOperationId: string | null,
): boolean {
  return Boolean(incomingOperationId && incomingOperationId === lastAppliedOperationId);
}
