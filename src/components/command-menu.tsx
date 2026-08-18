"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays, CheckCircle2, CornerDownLeft, Home, ListChecks, MoonStar,
  Pencil, Plus, Search, Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { useQuickAdd } from "@/components/quick-add";
import { useTaskEdit } from "@/components/task-edit";
import { cycleIndex, matchesQuery } from "@/lib/ui/text";
import type { LucideIcon } from "lucide-react";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
  keywords?: string;
}

export function CommandMenu() {
  const router = useRouter();
  const { state } = useStore();
  const { open: openQuickAdd } = useQuickAdd();
  const { open: openEdit } = useTaskEdit();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const reset = () => {
      setQuery("");
      setIndex(0);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) reset();
          return !o;
        });
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => {
      reset();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("frr:open-command", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("frr:open-command", onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const close = () => setOpen(false);
  const go = (href: string) => {
    router.push(href);
    close();
  };

  const actions: Cmd[] = useMemo(
    () => [
      { id: "add", label: "Создать задачу", hint: "Быстрое добавление", icon: Plus, keywords: "новая task", run: () => { close(); openQuickAdd(); } },
      { id: "today", label: "Перейти к «Сегодня»", icon: Home, keywords: "главная день", run: () => go("/") },
      { id: "plans", label: "Все планы и идеи", icon: ListChecks, keywords: "задачи входящие зоны", run: () => go("/plans") },
      { id: "calendar", label: "Открыть календарь", icon: CalendarDays, keywords: "день неделя месяц", run: () => go("/calendar") },
      { id: "assistant", label: "Спросить ассистента", icon: Sparkles, keywords: "ai чат", run: () => go("/assistant") },
      { id: "evening", label: "Вечерний обзор", icon: MoonStar, keywords: "итог сверка", run: () => go("/reviews") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const taskCmds: Cmd[] = useMemo(() => {
    if (query.trim().length < 2) return [];
    return state.tasks
      .filter((t) => matchesQuery(t.title, query))
      .slice(0, 6)
      .map((t) => ({
        id: `task-${t.id}`,
        label: t.title,
        hint: "Открыть задачу",
        icon: Pencil,
        run: () => { close(); openEdit(t.id); },
      }));
  }, [query, state.tasks, openEdit]);

  const filtered = useMemo(() => {
    const acts = query.trim()
      ? actions.filter((c) => matchesQuery(`${c.label} ${c.keywords ?? ""}`, query))
      : actions;
    return [...acts, ...taskCmds];
  }, [query, actions, taskCmds]);

  // Индекс держим в границах прямо при рендере (без эффекта).
  const sel = Math.min(index, Math.max(0, filtered.length - 1));

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex(cycleIndex(sel, 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex(cycleIndex(sel, -1, filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[sel]?.run();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Командное меню"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-[var(--r-lg)] border border-border-strong bg-surface shadow-soft-lg"
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 text-muted-2" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKey}
                placeholder="Команда или поиск задачи…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-2"
              />
              <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-2">Esc</kbd>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2" role="listbox" aria-label="Результаты">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">Ничего не найдено.</p>
              )}
              {filtered.map((c, i) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    role="option"
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => c.run()}
                    aria-selected={i === sel}
                    className={`flex w-full items-center gap-3 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-sm transition-colors ${
                      i === sel ? "bg-primary text-primary-fg" : "text-foreground hover:bg-surface-2"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-90" />
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && (
                      <span className={i === sel ? "text-primary-fg/70 text-xs" : "text-muted-2 text-xs"}>{c.hint}</span>
                    )}
                    {i === sel && <CornerDownLeft className="h-3.5 w-3.5 opacity-80" />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-2">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> ↑↓ выбор</span>
              <span>Enter — выполнить</span>
              <span className="ml-auto">⌘K — открыть/закрыть</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
