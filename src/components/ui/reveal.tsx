"use client";

import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { fadeUp, staggerContainer } from "@/lib/motion";

/** Появление одного блока снизу вверх. */
export function Reveal({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & ComponentProps<typeof motion.div>) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/** Контейнер, раскрывающий детей со stagger. Каждый ребёнок — <RevealItem>. */
export function RevealList({
  children,
  className,
  stagger = 0.045,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <motion.div
      variants={staggerContainer(stagger)}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}
