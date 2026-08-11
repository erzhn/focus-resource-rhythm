"use client";

import { useState } from "react";
import { FOCUS_ZONE_LABELS, type FocusZone } from "@/domain/focus";
import { useStore } from "@/lib/demo/store";
import { TaskRow } from "@/components/task-row";
import { Card, CardTitle } from "@/components/ui/primitives";
import { useQuickAdd } from "@/components/quick-add";
import { Plus } from "lucide-react";

const ZONES: FocusZone[] = ["now", "next", "later", "declined"];
const ZONE_VAR: Record<FocusZone, string> = {
  now: "var(--zone-now)",
  next: "var(--zone-next)",
  later: "var(--zone-later)",
  declined: "var(--zone-declined)",
};

export default function PlansPage() {
  const { state, moveZone } = useStore();
  const { open } = useQuickAdd();
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const inbox = state.tasks.filter(
    (t) =>
      (t.status === "inbox" || t.status === "planned") &&
      t.title.toLowerCase().includes(query.toLowerCase()),
  );

  const handleMove = (id: string, zone: FocusZone) => {
    const res = moveZone(id, zone);
    setNotice(res.message);
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Все планы и идеи</h1>
          <p className="mt-1 text-sm text-muted">
            Зоны фокуса: не больше трёх активных результатов в «Сейчас».
          </p>
        </div>
        <button
          onClick={open}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm text-primary-fg"
        >
          <Plus className="h-4 w-4" /> Задача
        </button>
      </header>

      {notice && (
        <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-2 text-sm text-[var(--warning)]">
          {notice}
        </div>
      )}

      {/* Зоны фокуса */}
      <div className="grid gap-3 md:grid-cols-2">
        {ZONES.map((zone) => {
          const results = state.results.filter((r) => r.zone === zone);
          return (
            <Card key={zone}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ZONE_VAR[zone] }} />
                  <CardTitle>{FOCUS_ZONE_LABELS[zone]}</CardTitle>
                </div>
                <span className="text-xs text-muted">
                  {results.length}
                  {zone === "now" ? " / 3" : ""}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {results.length === 0 && <p className="text-xs text-muted">Пусто.</p>}
                {results.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-2">
                    <p className="text-sm font-medium">{r.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ZONES.filter((z) => z !== zone).map((z) => (
                        <button
                          key={z}
                          onClick={() => handleMove(r.id, z)}
                          className="rounded-lg border border-border px-2 py-0.5 text-[11px] hover:bg-surface-2"
                        >
                          → {FOCUS_ZONE_LABELS[z]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Входящие */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Входящие и задачи</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск…"
            className="h-8 rounded-lg border border-border bg-surface-2 px-3 text-xs outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          {inbox.length === 0 ? (
            <p className="text-sm text-muted">Ничего не найдено.</p>
          ) : (
            inbox.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      </section>
    </div>
  );
}
