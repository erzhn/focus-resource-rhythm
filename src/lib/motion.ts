import type { Transition, Variants } from "motion/react";

/** Общие параметры анимаций. transform/opacity — для производительности. */
export const spring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 30 };
export const ease: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

/** Появление элемента снизу с лёгким подъёмом. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: ease },
};

/** Контейнер со stagger для списков. */
export const staggerContainer = (stagger = 0.045): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: 0.02 } },
});

/** Переход между страницами. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
};

/** Реакция на нажатие для интерактивных поверхностей. */
export const tap = { scale: 0.97 };
export const hoverLift = { y: -2 };
