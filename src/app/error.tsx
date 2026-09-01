"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

/** Граница ошибок: без неё сбой рантайма показывает пустой белый экран. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[var(--r-lg)] border border-border bg-surface p-8 text-center shadow-soft-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--attention)]/15 text-[var(--attention)]">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Что-то пошло не так</h1>
        <p className="mt-2 text-sm text-muted">
          Раздел не удалось отобразить. Данные не потеряны — попробуйте повторить.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] bg-primary px-5 text-sm font-semibold text-primary-fg shadow-primary transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <RotateCcw className="h-4 w-4" /> Повторить
        </button>
      </div>
    </div>
  );
}
