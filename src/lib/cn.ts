import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Объединение классов Tailwind с корректным разрешением конфликтов. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
