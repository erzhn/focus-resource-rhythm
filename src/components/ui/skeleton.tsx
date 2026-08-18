import { cn } from "@/lib/cn";

/** Скелет загрузки (мерцание из globals.css). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[var(--r-sm)]", className)} />;
}

/** Готовый скелет карточки. */
export function CardSkeleton() {
  return (
    <div className="rounded-[var(--r)] border border-border bg-surface p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-40" />
      <Skeleton className="mt-4 h-2 w-full" />
    </div>
  );
}
