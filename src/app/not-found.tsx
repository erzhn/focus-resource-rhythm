import Link from "next/link";
import { Compass } from "lucide-react";

/** Страница 404 в дизайн-системе (по умолчанию Next отдаёт английскую на белом фоне). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[var(--r-lg)] border border-border bg-surface p-8 text-center shadow-soft-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-primary">
          <Compass className="h-6 w-6" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Ошибка 404</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Такой страницы нет</h1>
        <p className="mt-2 text-sm text-muted">
          Ссылка устарела или содержит опечатку. Вернитесь к плану дня — оттуда доступны все разделы.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-[var(--r-sm)] bg-primary px-5 text-sm font-semibold text-primary-fg shadow-primary transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          К «Сегодня»
        </Link>
      </div>
    </div>
  );
}
