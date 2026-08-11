"use client";

import { useState } from "react";
import { addDays, format } from "date-fns";
import { CheckCircle2, MoonStar, CalendarRange } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { TASK_STATUS_LABELS } from "@/domain/types";
import type { ResultDecision } from "@/lib/demo/types";
import { FOCUS_ZONE_LABELS } from "@/domain/focus";

type Tab = "evening" | "weekly";

export default function ReviewsPage() {
  const [tab, setTab] = useState<Tab>("evening");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Сверки</h1>
        <p className="mt-1 text-sm text-muted">Вечерний итог дня и еженедельный обзор.</p>
      </header>
      <div className="flex gap-2">
        <button
          onClick={() => setTab("evening")}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
            tab === "evening" ? "bg-primary text-primary-fg" : "border border-border"
          }`}
        >
          <MoonStar className="h-4 w-4" /> Вечерний итог
        </button>
        <button
          onClick={() => setTab("weekly")}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
            tab === "weekly" ? "bg-primary text-primary-fg" : "border border-border"
          }`}
        >
          <CalendarRange className="h-4 w-4" /> Еженедельная сверка
        </button>
      </div>
      {tab === "evening" ? <EveningReview /> : <WeeklyReview />}
    </div>
  );
}

function EveningReview() {
  const { state, setTaskStatus, setEveningEnergy, saveEveningReview } = useStore();
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const todays = state.tasks.filter(
    (t) => t.status !== "cancelled" && t.status !== "postponed",
  );
  const done = todays.filter((t) => t.status === "done").length;
  const partial = todays.filter((t) => t.status === "partial").length;
  const unfinished = todays.filter((t) => t.status !== "done");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Выполнено</CardTitle>
          <p className="mt-2 text-2xl font-semibold text-success">{done}</p>
        </Card>
        <Card>
          <CardTitle>Частично</CardTitle>
          <p className="mt-2 text-2xl font-semibold text-[var(--warning)]">{partial}</p>
        </Card>
        <Card>
          <CardTitle>Осталось</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{unfinished.length}</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Задачи дня</CardTitle>
        <div className="mt-3 space-y-2">
          {todays.map((t) => (
            <div key={t.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.title}</span>
                <span className="text-[11px] text-muted">{TASK_STATUS_LABELS[t.status]}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip active={t.status === "done"} onClick={() => setTaskStatus(t.id, "done")}>
                  Выполнено
                </Chip>
                <Chip active={t.status === "partial"} onClick={() => setTaskStatus(t.id, "partial")}>
                  Частично
                </Chip>
                {t.status !== "done" && <UnfinishedActions taskId={t.id} />}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Уровень сил к концу дня</CardTitle>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setEveningEnergy(n)}
              aria-label={`Силы вечером ${n}`}
              className={`h-8 w-8 rounded-lg border text-sm ${
                state.eveningEnergy === n ? "border-primary bg-primary text-primary-fg" : "border-border"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Вывод дня</CardTitle>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Что помешало? Что перенести? Короткий вывод."
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={() => {
              saveEveningReview(note);
              setSaved(true);
            }}
          >
            Сохранить итог
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Итог сохранён
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

function UnfinishedActions({ taskId }: { taskId: string }) {
  const { postponeTask, splitTask, setTaskStatus } = useStore();
  const [mode, setMode] = useState<null | "postpone" | "split">(null);
  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [parts, setParts] = useState("");

  return (
    <>
      <Chip onClick={() => setMode(mode === "postpone" ? null : "postpone")}>Перенести</Chip>
      <Chip onClick={() => setMode(mode === "split" ? null : "split")}>Разделить</Chip>
      <Chip onClick={() => setTaskStatus(taskId, "cancelled")}>Отменить</Chip>

      {mode === "postpone" && (
        <div className="mt-2 w-full rounded-lg border border-border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина переноса (обязательно)"
              className="min-w-40 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
            />
            <Button
              size="sm"
              disabled={!reason.trim()}
              onClick={() => {
                postponeTask(taskId, new Date(date), reason);
                setMode(null);
                setReason("");
              }}
            >
              Перенести
            </Button>
          </div>
          {!reason.trim() && (
            <p className="mt-1 text-[11px] text-[var(--warning)]">
              Перенос возможен только с указанием причины.
            </p>
          )}
        </div>
      )}

      {mode === "split" && (
        <div className="mt-2 w-full rounded-lg border border-border p-2">
          <input
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            placeholder="Части через запятую: подготовить, выполнить, проверить"
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
          />
          <Button
            size="sm"
            className="mt-2"
            disabled={!parts.trim()}
            onClick={() => {
              splitTask(taskId, parts.split(","));
              setMode(null);
              setParts("");
            }}
          >
            Разделить
          </Button>
        </div>
      )}
    </>
  );
}

function WeeklyReview() {
  const { state, focusResults, decideResult, setNextWeekResults } = useStore();
  const [drafts, setDrafts] = useState<string[]>(["", "", ""]);
  const [savedResults, setSavedResults] = useState(false);

  const done = state.tasks.filter((t) => t.status === "done").length;
  const partial = state.tasks.filter((t) => t.status === "partial").length;
  const postponed = state.postponements.length;
  const cancelled = state.tasks.filter((t) => t.status === "cancelled").length;
  const bigResults = state.results.filter((r) => r.zone === "now" || r.zone === "next");
  const noProgress = bigResults.filter((r) => r.progress === 0);
  const noAction = focusResults.filter((r) => r.zone === "now" && !r.hasNextAction);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Выполнено" value={done} tone="var(--success)" />
        <Metric label="Частично" value={partial} tone="var(--warning)" />
        <Metric label="Перенесено" value={postponed} tone="var(--zone-next)" />
        <Metric label="Отменено" value={cancelled} tone="var(--zone-declined)" />
      </div>

      {(noAction.length > 0 || noProgress.length > 0) && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/10">
          <CardTitle className="text-[var(--warning)]">Требует внимания</CardTitle>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {noAction.map((r) => (
              <li key={r.id}>«{r.title}» — активный результат без ближайшего действия.</li>
            ))}
            {noProgress.map((r) => (
              <li key={r.id}>«{r.title}» — крупный результат без прогресса.</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>Решения по крупным результатам</CardTitle>
        <div className="mt-3 space-y-3">
          {bigResults.map((r) => (
            <ResultDecisionRow key={r.id} resultId={r.id} title={r.title} zone={r.zone} onDecide={decideResult} />
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>До трёх результатов следующей недели</CardTitle>
        <div className="mt-3 space-y-2">
          {drafts.map((d, i) => (
            <input
              key={i}
              value={d}
              onChange={(e) => {
                const next = [...drafts];
                next[i] = e.target.value;
                setDrafts(next);
              }}
              placeholder={`Результат ${i + 1}`}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={() => {
              setNextWeekResults(drafts.filter((d) => d.trim()));
              setSavedResults(true);
            }}
          >
            Сохранить сверку
          </Button>
          {savedResults && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Сохранено
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

function ResultDecisionRow({
  resultId,
  title,
  zone,
  onDecide,
}: {
  resultId: string;
  title: string;
  zone: string;
  onDecide: (id: string, d: ResultDecision, reason: string) => void;
}) {
  const [decision, setDecision] = useState<ResultDecision | null>(null);
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const options: { key: ResultDecision; label: string }[] = [
    { key: "continue", label: "Продолжить" },
    { key: "change", label: "Изменить" },
    { key: "postpone", label: "Перенести" },
    { key: "pause", label: "Приостановить" },
    { key: "decline", label: "Отказаться" },
  ];
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[11px] text-muted">{FOCUS_ZONE_LABELS[zone as never] ?? zone}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o.key} active={decision === o.key} onClick={() => setDecision(o.key)}>
            {o.label}
          </Chip>
        ))}
      </div>
      {decision && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина решения"
            className="min-w-40 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              onDecide(resultId, decision, reason);
              setSaved(true);
            }}
          >
            Применить
          </Button>
          {saved && <CheckCircle2 className="h-4 w-4 text-success" />}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
        active ? "border-primary bg-primary text-primary-fg" : "border-border hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardTitle>{label}</CardTitle>
      <p className="mt-2 text-2xl font-semibold" style={{ color: tone }}>
        {value}
      </p>
    </Card>
  );
}
