"use client";

import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

/** Горизонтальная шкала ресурса с иконкой и подписью. Значение 0..1. */
export function ResourceMeter({
  icon: Icon,
  label,
  value,
  detail,
  color = "var(--primary)",
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail?: string;
  color?: string;
  /** Мягкий фон-подложка (по умолчанию из color). */
  tone?: string;
}) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="rounded-[var(--r)] border border-border bg-surface p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg"
          style={{ backgroundColor: tone ?? `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: reduce ? `${v * 100}%` : 0 }}
          animate={{ width: `${v * 100}%` }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {detail && <p className="mt-1.5 text-[11px] text-muted-2">{detail}</p>}
    </div>
  );
}
