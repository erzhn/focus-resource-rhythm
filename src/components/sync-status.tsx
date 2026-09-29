"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/demo/store";
import { useToast } from "@/components/ui/toast";

/**
 * Показывает неудачи сохранения.
 *
 * Стор живёт выше ToastProvider (он в корневом layout), поэтому сам показать
 * тост не может. Он лишь выставляет syncError, а этот компонент — уже внутри
 * оболочки приложения — превращает его в сообщение.
 *
 * Каждая ошибка показывается один раз: сравниваем id, иначе повторный рендер
 * (и двойной вызов эффекта в StrictMode) показал бы её дважды.
 */
export function SyncStatus() {
  const { syncError } = useStore();
  const toast = useToast();
  const shownId = useRef<number | null>(null);

  useEffect(() => {
    if (!syncError || shownId.current === syncError.id) return;
    shownId.current = syncError.id;
    toast.warning(syncError.message);
  }, [syncError, toast]);

  return null;
}
