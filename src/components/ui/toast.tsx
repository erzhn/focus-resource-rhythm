"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastTone = "success" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  /** Показать уведомление. Возвращает id (можно закрыть вручную). */
  show: (message: string, tone?: ToastTone) => string;
  success: (message: string) => string;
  info: (message: string) => string;
  warning: (message: string) => string;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast вне ToastProvider");
  return c;
}

const TONE: Record<ToastTone, { icon: typeof Info; color: string }> = {
  success: { icon: CheckCircle2, color: "var(--resource)" },
  info: { icon: Info, color: "var(--primary)" },
  warning: { icon: TriangleAlert, color: "var(--attention)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reduce = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((list) => [...list.slice(-3), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 4200),
      );
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      info: (m) => show(m, "info"),
      warning: (m) => show(m, "warning"),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[84px] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end"
        role="region"
        aria-label="Уведомления"
      >
        <AnimatePresence>
          {items.map((t) => {
            const { icon: Icon, color } = TONE[t.tone];
            return (
              <motion.div
                key={t.id}
                layout={!reduce}
                initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                role="status"
                aria-live="polite"
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[var(--r)] border border-border-strong bg-surface px-4 py-3 shadow-soft-lg"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <p className="flex-1 text-sm text-foreground">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Закрыть уведомление"
                  className="rounded-lg p-1 text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
