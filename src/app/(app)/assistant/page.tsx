"use client";

import { useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Send, Sparkles, User } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Button, Card } from "@/components/ui/primitives";
import { ENERGY_BAND_LABELS, energyBand } from "@/domain/resources";
import { FOCUS_ZONE_LABELS } from "@/domain/focus";
import { formatDate, formatMinutes, formatMoney } from "@/lib/format";
import type { Scale1to5 } from "@/domain/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Помоги спланировать день",
  "Какая задача сейчас главная и почему?",
  "Я перегружен — что перенести?",
  "Как сформулировать цель на 90 дней?",
];

export default function AssistantPage() {
  const store = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const buildContext = (): string => {
    const { state, dayPlan, now, focusResults } = store;
    const active = state.results.filter((r) => r.zone === "now");
    const overdue = state.tasks.filter(
      (t) => t.dueDate && differenceInCalendarDays(now, t.dueDate) > 0 && t.status !== "done",
    ).length;
    const lines = [
      `Дата: ${formatDate(now)}. План дня: ${state.dayPlanConfirmed ? "подтверждён" : "черновик"}.`,
      `Уровень сил: ${ENERGY_BAND_LABELS[energyBand(state.morningEnergy as Scale1to5)]} (${state.morningEnergy}/5).`,
      `Доступное время: ${formatMinutes(state.availableMinutes)}, резерв ${Math.round(state.reserveRatio * 100)}%.`,
      state.dailyMoneyLimitMajor !== null ? `Дневной денежный лимит: ${formatMoney(state.dailyMoneyLimitMajor)}.` : "",
      `Главное дело: ${dayPlan.main ? dayPlan.main.task.title : "не выбрано"}.`,
      dayPlan.secondary.length
        ? `Дополнительные: ${dayPlan.secondary.map((p) => p.task.title).join("; ")}.`
        : "",
      `Активные результаты (${active.length}/3): ${active
        .map((r) => `${r.title} — ${Math.round(r.progress * 100)}% [${FOCUS_ZONE_LABELS[r.zone]}]`)
        .join("; ") || "нет"}.`,
      overdue > 0 ? `Просроченных задач: ${overdue}.` : "",
      focusResults.some((r) => r.zone === "now" && !r.hasNextAction)
        ? "Внимание: есть активный результат без ближайшего действия."
        : "",
    ];
    return lines.filter(Boolean).join("\n");
  };

  const scrollDown = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;
    setNotice(null);
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    scrollDown();

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: buildContext() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Ошибка ассистента." }));
        setNotice(data.error ?? "Ошибка ассистента.");
        setStreaming(false);
        return;
      }

      // Потоковое чтение ответа.
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
        scrollDown();
      }
    } catch {
      setNotice("Не удалось связаться с ассистентом.");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col md:h-[calc(100dvh-5rem)]">
      <header className="mb-3">
        <div className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Диалог
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Ассистент</h1>
        <p className="mt-1 text-sm text-muted">
          Спросите о планах, задачах и приоритетах — ассистент видит ваш контекст. Или просто
          поговорите.
        </p>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <Card>
            <p className="text-sm text-muted">С чего начнём?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-fg"
                  : "border border-border bg-surface"
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
            {m.role === "user" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {notice && (
          <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/10">
            <p className="text-sm text-[var(--warning)]">{notice}</p>
          </Card>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-2 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Напишите сообщение…"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <Button type="submit" disabled={streaming || !input.trim()} aria-label="Отправить">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
