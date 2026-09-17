"use client";

import {
  Car, Gamepad2, Gift, GraduationCap, HeartPulse, Home, Landmark,
  Laptop, Receipt, ShoppingBag, UtensilsCrossed, Wifi, type LucideIcon,
} from "lucide-react";
import { CATEGORY_BY_ID, type CategoryId } from "@/domain/finance/categories";

/**
 * Иконка категории.
 *
 * Карта имя→компонент вместо динамического импорта: так дерево иконок попадает
 * в бандл целиком и предсказуемо, без задержки на подгрузку при первом показе.
 */
const ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed, Car, ShoppingBag, Gamepad2, Wifi, GraduationCap,
  Home, Laptop, Landmark, Gift, HeartPulse, Receipt,
};

export function CategoryIcon({
  category,
  className,
  colored = true,
}: {
  category: CategoryId;
  className?: string;
  colored?: boolean;
}) {
  const meta = CATEGORY_BY_ID.get(category);
  const Icon = ICONS[meta?.icon ?? "Receipt"] ?? Receipt;
  return (
    <Icon
      className={className}
      aria-hidden
      style={
        colored && meta
          ? { color: `color-mix(in oklab, ${meta.color} 58%, var(--foreground))` }
          : undefined
      }
    />
  );
}

/** Цвет категории, уже подмешанный к теме — для полос и подписей. */
export function categoryColor(category: CategoryId): string {
  const meta = CATEGORY_BY_ID.get(category);
  return meta ? `color-mix(in oklab, ${meta.color} 58%, var(--foreground))` : "var(--muted)";
}

/** Насыщенный цвет категории — для заливки полос, где текста нет. */
export function categoryFill(category: CategoryId): string {
  return CATEGORY_BY_ID.get(category)?.color ?? "var(--muted)";
}
