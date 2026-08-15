"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, LogOut } from "lucide-react";
import { APP } from "@/config/app";
import { isDemoMode } from "@/lib/env";
import { NAV_ITEMS } from "@/components/nav";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const primary = NAV_ITEMS.filter((i) => i.primary).slice(0, 5);

  return (
    <div className="min-h-dvh md:flex">
      {/* Боковая навигация (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
        <Link href="/" className="mb-6 px-2">
          <div className="text-sm font-bold leading-tight">{APP.name}</div>
          <div className="text-[11px] text-muted">{APP.tagline}</div>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  active ? "bg-primary text-primary-fg" : "text-foreground hover:bg-surface-2",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {isDemoMode ? (
          <DemoBadge />
        ) : (
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </form>
        )}
      </aside>

      {/* Контент */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemoMode && (
          <div className="flex items-center gap-2 border-b border-border bg-[var(--warning)]/10 px-4 py-2 text-xs text-[var(--warning)] md:hidden">
            <Info className="h-4 w-4 shrink-0" />
            Демо-режим: данные в памяти, без базы. Настройте Supabase для реального хранения.
          </div>
        )}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10">
          {children}
        </main>
      </div>

      {/* Нижняя навигация (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                active ? "text-primary" : "text-muted",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function DemoBadge() {
  return (
    <div className="mt-2 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-[11px] text-[var(--warning)]">
      Демо-режим: данные в памяти. Настройте Supabase для реального хранения и RLS.
    </div>
  );
}
