"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

export function Card({
  className,
  interactive,
  ...props
}: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r)] border border-border/70 bg-surface p-5 shadow-soft",
        interactive && "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-soft-lg",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted",
        className,
      )}
      {...props}
    />
  );
}

type ButtonProps = ComponentProps<typeof motion.button> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "soft";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  const reduce = useReducedMotion();
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-fg shadow-primary hover:brightness-[1.06]",
    soft: "bg-[var(--primary-soft)] text-primary hover:bg-[color-mix(in_oklab,var(--primary)_18%,transparent)]",
    ghost: "text-foreground hover:bg-surface-2",
    outline: "border border-border-strong bg-surface hover:bg-surface-2 text-foreground",
    danger: "bg-[var(--danger)] text-white hover:brightness-105",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-12 px-6 text-base gap-2",
    icon: "h-10 w-10",
  };
  return (
    <motion.button
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--r-sm)] font-semibold transition-[filter,background-color,color] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        className,
      )}
      style={color ? { backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--r-lg)] border border-dashed border-border-strong bg-surface/60 px-8 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-primary">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
