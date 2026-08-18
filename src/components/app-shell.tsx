"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelLeftClose, PanelLeft, Search, LogOut, Waves } from "lucide-react";
import { APP } from "@/config/app";
import { isDemoMode } from "@/lib/env";
import { NAV_ITEMS } from "@/components/nav";
import { signOut } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { pageVariants } from "@/lib/motion";
import { cn } from "@/lib/cn";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function openCommandMenu() {
  window.dispatchEvent(new CustomEvent("frr:open-command"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const primary = NAV_ITEMS.filter((i) => i.primary).slice(0, 5);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- чтение сохранённого состояния при монтировании
      setCollapsed(localStorage.getItem("frr-sidebar") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const n = !c;
      try {
        localStorage.setItem("frr-sidebar", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  return (
    <div className="min-h-dvh md:flex">
      {/* Боковая навигация (desktop) */}
      <motion.aside
        animate={{ width: collapsed ? 78 : 264 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 32 }}
        className="sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-border/70 bg-surface/70 px-3 py-4 backdrop-blur-xl md:flex"
      >
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-primary">
            <Waves className="h-5 w-5" />
          </span>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                className="min-w-0"
              >
                <div className="truncate text-sm font-extrabold leading-tight">{APP.name}</div>
                <div className="truncate text-[10px] text-muted-2">{APP.tagline}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={openCommandMenu}
          className={cn(
            "mb-3 flex items-center gap-2 rounded-[var(--r-sm)] border border-border bg-surface-2/60 px-2.5 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label="Быстрый поиск и команды"
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Поиск…</span>
              <kbd className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-muted-2">⌘K</kbd>
            </>
          )}
        </button>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-[var(--r-sm)] px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active ? "text-primary-fg" : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-0 rounded-[var(--r-sm)] bg-primary shadow-primary"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 34 }}
                  />
                )}
                <Icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 flex flex-col gap-1 border-t border-border/70 pt-2">
          <ThemeToggle compact={collapsed} />
          {!isDemoMode && (
            <form action={signOut}>
              <button
                type="submit"
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
                aria-label="Выйти"
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && "Выйти"}
              </button>
            </form>
          )}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Развернуть панель" : "Свернуть панель"}
            className={cn(
              "flex items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-2 text-sm text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && "Свернуть"}
          </button>
          {isDemoMode && !collapsed && <DemoBadge />}
        </div>
      </motion.aside>

      {/* Контент */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemoMode && (
          <div className="flex items-center gap-2 border-b border-border/70 bg-[var(--warning)]/10 px-4 py-2 text-xs font-medium text-[var(--warning)] md:hidden">
            Демо-режим: данные в памяти. Настройте Supabase для реального хранения.
          </div>
        )}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              variants={pageVariants}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Нижняя навигация (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border/70 bg-surface/85 backdrop-blur-xl md:hidden">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold"
            >
              {active && (
                <motion.span
                  layoutId="mobile-nav-active"
                  className="absolute top-1.5 h-9 w-14 rounded-full bg-[var(--primary-soft)]"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 34 }}
                />
              )}
              <Icon className={cn("relative z-10 h-5 w-5", active ? "text-primary" : "text-muted")} />
              <span className={cn("relative z-10", active ? "text-primary" : "text-muted-2")}>{item.short ?? item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function DemoBadge() {
  return (
    <div className="mt-1 rounded-[var(--r-sm)] border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-[11px] leading-snug text-[var(--warning)]">
      Демо-режим: данные в памяти.
    </div>
  );
}
