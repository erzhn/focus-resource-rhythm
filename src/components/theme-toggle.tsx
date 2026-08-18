"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const LABEL = { system: "Системная тема", light: "Светлая тема", dark: "Тёмная тема" } as const;

function apply(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem("frr-theme");
    else localStorage.setItem("frr-theme", theme);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("frr-theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- синхронизация с localStorage при монтировании
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const next = () => {
    const n = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(n);
    apply(n);
  };

  const Icon = ICON[theme];
  return (
    <button
      onClick={next}
      aria-label={`Тема: ${LABEL[theme]}. Переключить`}
      title={LABEL[theme]}
      className="flex items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <motion.span key={theme} initial={{ rotate: -30, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
        <Icon className="h-4 w-4" />
      </motion.span>
      {!compact && <span>{LABEL[theme]}</span>}
    </button>
  );
}
