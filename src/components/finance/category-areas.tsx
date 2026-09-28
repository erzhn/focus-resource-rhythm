"use client";

import { useMemo } from "react";
import { Compass } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Card, CardTitle } from "@/components/ui/primitives";
import { CategoryIcon } from "./category-icon";
import { CATEGORIES, type CategoryId } from "@/domain/finance/categories";
import { unmappedCategories } from "@/domain/finance/spheres";
import { plural } from "@/lib/ui/text";

/**
 * Сопоставление категорий трат со сферами жизни.
 *
 * Выбор делается один раз здесь, а не при каждой записи расхода: быстрый ввод
 * («Такси 250» и Enter) — главное в учёте, и добавлять к нему ещё один вопрос
 * значит его сломать.
 *
 * Несопоставленные категории никуда не приписываются: в разрезе по сферам они
 * считаются отдельно, чтобы сумма не выглядела полной, когда она таковой не
 * является.
 */
export function CategoryAreasCard() {
  const { state, setCategoryArea } = useStore();

  // Подсказываем в первую очередь то, на что человек уже потратил деньги.
  const needAttention = useMemo(
    () => new Set(unmappedCategories(state.transactions, state.categoryAreas)),
    [state.transactions, state.categoryAreas],
  );

  if (state.lifeAreas.length === 0) {
    return (
      <Card>
        <CardTitle className="flex items-center gap-1.5">
          <Compass className="h-3.5 w-3.5" /> Траты и сферы жизни
        </CardTitle>
        <p className="mt-2 text-sm text-muted">
          Сначала заведите сферы жизни — тогда расходы можно будет разложить по ним, и на экране
          «Цели» станет видно, куда уходят деньги.
        </p>
      </Card>
    );
  }

  const mappedCount = CATEGORIES.filter((c) => state.categoryAreas[c.id]).length;

  return (
    <Card>
      <CardTitle className="flex items-center gap-1.5">
        <Compass className="h-3.5 w-3.5" /> Траты и сферы жизни
      </CardTitle>
      <p className="mt-2 text-sm text-muted">
        Выберите сферу для каждой категории — на экране «Цели» появится, сколько денег уходит в
        каждую. Категории без сферы просто не попадают в разрез.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {CATEGORIES.map((c) => (
          <Row
            key={c.id}
            category={c.id}
            label={c.label}
            value={state.categoryAreas[c.id] ?? ""}
            areas={state.lifeAreas}
            highlight={needAttention.has(c.id)}
            onChange={(areaId) => setCategoryArea(c.id, areaId || null)}
          />
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted-2">
        Сопоставлено {mappedCount} из {CATEGORIES.length}{" "}
        {plural(CATEGORIES.length, "категории", "категорий", "категорий")}
        {needAttention.size > 0 &&
          ` · подсвечены те, по которым уже есть траты`}
      </p>
    </Card>
  );
}

function Row({
  category,
  label,
  value,
  areas,
  highlight,
  onChange,
}: {
  category: CategoryId;
  label: string;
  value: string;
  areas: { id: string; name: string }[];
  highlight: boolean;
  onChange: (areaId: string) => void;
}) {
  const id = `cat-area-${category}`;
  return (
    <div
      className={`flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 ${
        highlight && !value ? "bg-[color-mix(in_oklab,var(--attention)_10%,transparent)]" : ""
      }`}
    >
      <CategoryIcon category={category} className="h-4 w-4 shrink-0" />
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[36px] w-36 shrink-0 rounded-[var(--r-sm)] border border-border bg-surface-2 px-2 text-xs outline-none focus:border-primary"
      >
        <option value="">— не выбрана —</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
