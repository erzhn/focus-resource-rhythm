"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Вкладки раздела «Торговля».
 *
 * Шесть экранов не стали шестью пунктами общей навигации: в нижней панели
 * телефона уже пять главных разделов, и шестой туда не влезет, а растянутый
 * список в боковом меню перестал бы читаться.
 */

const TABS = [
  { href: "/trading", label: "Обзор", exact: true },
  { href: "/trading/trades", label: "Сделки" },
  { href: "/trading/analytics", label: "Аналитика" },
  { href: "/trading/journal", label: "Дневник" },
  { href: "/trading/accounts", label: "Счета" },
];

export function SectionTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы торговли"
      className="-mx-1 mb-4 flex gap-1 overflow-x-auto rounded-[var(--r)] bg-surface-2 p-1"
    >
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center rounded-[var(--r-sm)] px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${
              active
                ? "bg-surface text-foreground shadow-soft"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
