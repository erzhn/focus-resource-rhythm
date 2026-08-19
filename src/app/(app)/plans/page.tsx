"use client";

import { useState } from "react";
import { FOCUS_ZONE_LABELS, type FocusZone } from "@/domain/focus";
import { useStore } from "@/lib/demo/store";
import { TaskRow } from "@/components/task-row";
import { Card, CardTitle, Button, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { RevealList, RevealItem } from "@/components/ui/reveal";
import { useToast } from "@/components/ui/toast";
import { useQuickAdd } from "@/components/quick-add";
import { Plus, Inbox, Search } from "lucide-react";

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
  const toast = useToast();
  const [query, setQuery] = useState("");

  const inbox = state.tasks.filter(
    (t) =>
      (t.status === "inbox" || t.status === "planned") &&
      t.title.toLowerCase().includes(query.toLowerCase()),
  );

  const handleMove = (id: string, zone: FocusZone) => {
    const res = moveZone(id, zone);
    toast.show(res.message, res.ok ? "success" : "warning");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Фокус"
        title="Все планы и идеи"
        subtitle="Зоны фокуса: не больше трёх активных результатов в «Сейчас»."
        actions={
          <Button size="sm" onClick={open}>
            <Plus className="h-4 w-4" /> Задача
          </Button>
        }
      />

      {/* Зоны фокуса */}
      <RevealList className="grid gap-3 md:grid-cols-2">
        {ZONES.map((zone) => {
          const results = state.results.filter((r) => r.zone === zone);
          return (
            <RevealItem key={zone}>
            <Card className="h-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ZONE_VAR[zone] }} />
                  <CardTitle>{FOCUS_ZONE_LABELS[zone]}</CardTitle>
                </div>
                <span className="text-xs font-semibold text-muted-2">
                  {results.length}
                  {zone === "now" ? " / 3" : ""}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {results.length === 0 && <p className="text-xs text-muted-2">Пусто.</p>}
                {results.map((r) => (
                  <div key={r.id} className="rounded-[var(--r-sm)] bg-surface-2 p-2.5">
                    <p className="text-sm font-medium">{r.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {ZONES.filter((z) => z !== zone).map((z) => (
                        <button
                          key={z}
                          onClick={() => handleMove(r.id, z)}
                          className="rounded-lg bg-surface px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                        >
                          → {FOCUS_ZONE_LABELS[z]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            </RevealItem>
          );
        })}
      </RevealList>

      {/* Входящие */}
      <section className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-muted">Входящие и задачи</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск…"
              aria-label="Поиск по входящим"
              className="h-9 rounded-[var(--r-sm)] border border-border bg-surface-2 pl-8 pr-3 text-xs outline-none focus:border-primary"
            />
          </div>
        </div>
        {inbox.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title={query ? "Ничего не найдено" : "Входящие пусты"}
            hint={query ? "Измените запрос." : "Быстро добавьте идею — она попадёт сюда."}
            action={
              !query && (
                <Button size="sm" onClick={open}>
                  <Plus className="h-4 w-4" /> Добавить задачу
                </Button>
              )
            }
          />
        ) : (
          <RevealList className="space-y-2">
            {inbox.map((t) => (
              <RevealItem key={t.id}>
                <TaskRow task={t} />
              </RevealItem>
            ))}
          </RevealList>
        )}
      </section>
    </div>
  );
}
