"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { Plus, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { formulationService, type FormulationSuggestion } from "@/domain/formulation";
import type { Scale1to5, SchedulingMode } from "@/domain/types";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";

interface QuickAddContextValue {
  open: () => void;
}
const Ctx = createContext<QuickAddContextValue | null>(null);
export const useQuickAdd = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useQuickAdd вне QuickAddProvider");
  return c;
};

type Step = "form" | "ask" | "assistant";

const scale = [1, 2, 3, 4, 5] as const;

function ScaleField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: Scale1to5) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted">{label}</label>
      <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
        {scale.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n as Scale1to5)}
            className={`h-8 w-8 rounded-lg border text-sm transition ${
              value === n
                ? "border-primary bg-primary text-primary-fg"
                : "border-border hover:bg-surface-2"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const { addTask, updateTask, state } = useStore();
  const toast = useToast();
  const [openState, setOpenState] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<FormulationSuggestion | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resultId, setResultId] = useState<string>("");
  const [importance, setImportance] = useState<Scale1to5>(3);
  const [consequence, setConsequence] = useState<Scale1to5>(3);
  const [goalLink, setGoalLink] = useState<Scale1to5>(3);
  const [energyRequired, setEnergyRequired] = useState<Scale1to5>(3);
  const [plannedMinutes, setPlannedMinutes] = useState(30);
  const [plannedMoney, setPlannedMoney] = useState(0);
  const [due, setDue] = useState("");
  const [fixed, setFixed] = useState(false);
  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>("unordered");

  const reset = () => {
    setStep("form");
    setShowAdvanced(false);
    setCreatedId(null);
    setSuggestion(null);
    setTitle("");
    setDescription("");
    setResultId("");
    setImportance(3);
    setConsequence(3);
    setGoalLink(3);
    setEnergyRequired(3);
    setPlannedMinutes(30);
    setPlannedMoney(0);
    setDue("");
    setFixed(false);
    setSchedulingMode("unordered");
  };

  const close = () => {
    setOpenState(false);
    reset();
  };

  const trapRef = useFocusTrap<HTMLDivElement>(openState, close);

  const ctxValue = useMemo<QuickAddContextValue>(
    () => ({
      open: () => {
        reset();
        setOpenState(true);
      },
    }),
    [],
  );

  const submit = () => {
    if (!title.trim()) return;
    const id = addTask({
      title: title.trim(),
      description: description.trim() || null,
      resultId: resultId || null,
      linkedToActiveResult: Boolean(
        resultId && state.results.find((r) => r.id === resultId)?.zone === "now",
      ),
      importance,
      consequence,
      goalLink,
      energyRequired,
      plannedMinutes,
      plannedMoneyMinor: Math.round(plannedMoney * 100),
      dueDate: due ? new Date(due) : null,
      schedulingMode,
      status: "planned",
    });
    setCreatedId(id);
    toast.success("Задача добавлена во «Входящие»");
    setStep("ask"); // Обязательный вопрос про формулировку.
  };

  const runAssistant = () => {
    setSuggestion(
      formulationService.suggest({
        title,
        description: description || null,
        plannedMinutes,
        dueDate: due ? new Date(due) : null,
        energyRequired,
      }),
    );
    setStep("assistant");
  };

  return (
    <Ctx.Provider value={ctxValue}>
      {children}

      {/* Плавающая кнопка быстрого добавления (доступна большим пальцем). */}
      <motion.button
        onClick={ctxValue.open}
        aria-label="Быстро добавить задачу"
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.06 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="fixed bottom-[76px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-primary md:bottom-7 md:right-7"
      >
        <Plus className="h-6 w-6" />
      </motion.button>

      {openState && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm md:items-center md:p-4"
          onClick={close}
        >
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Новая задача"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="w-full max-w-lg"
          >
          <Card className="max-h-[90vh] w-full overflow-y-auto rounded-b-none md:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {step === "form" && "Новая задача"}
                {step === "ask" && "Задача сохранена"}
                {step === "assistant" && "Помощник формулировки"}
              </h2>
              <button onClick={close} aria-label="Закрыть" className="rounded-lg p-1 hover:bg-surface-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            {step === "form" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted" htmlFor="qa-title">
                    Название
                  </label>
                  <input
                    id="qa-title"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
                    placeholder="Что нужно сделать?"
                    className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>

                <ScaleField label="Важность (1–5)" value={importance} onChange={setImportance} />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted" htmlFor="qa-min">
                      Плановое время, мин
                    </label>
                    <input
                      id="qa-min"
                      type="number"
                      min={0}
                      value={plannedMinutes}
                      onChange={(e) => setPlannedMinutes(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted" htmlFor="qa-due">
                      Срок
                    </label>
                    <input
                      id="qa-due"
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted" htmlFor="qa-result">
                    Связать с результатом (необязательно)
                  </label>
                  <select
                    id="qa-result"
                    value={resultId}
                    onChange={(e) => setResultId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">— без результата —</option>
                    {state.results.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs font-medium text-primary"
                >
                  {showAdvanced ? "Скрыть расширенные поля" : "Показать расширенные поля"}
                </button>

                {showAdvanced && (
                  <div className="space-y-4 rounded-xl border border-border p-3">
                    <div>
                      <label className="text-xs font-medium text-muted" htmlFor="qa-desc">
                        Описание
                      </label>
                      <textarea
                        id="qa-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <ScaleField
                      label="Последствия невыполнения (1–5)"
                      value={consequence}
                      onChange={setConsequence}
                    />
                    <ScaleField
                      label="Связь с главной целью (1–5)"
                      value={goalLink}
                      onChange={setGoalLink}
                    />
                    <ScaleField
                      label="Требуемый уровень сил (1–5)"
                      value={energyRequired}
                      onChange={setEnergyRequired}
                    />
                    <div>
                      <label className="text-xs font-medium text-muted" htmlFor="qa-money">
                        Плановая сумма, сом
                      </label>
                      <input
                        id="qa-money"
                        type="number"
                        min={0}
                        value={plannedMoney}
                        onChange={(e) => setPlannedMoney(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["unordered", "ordered", "timeblock"] as SchedulingMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSchedulingMode(m)}
                          className={`rounded-lg border px-3 py-1.5 text-xs ${
                            schedulingMode === m ? "border-primary bg-primary text-primary-fg" : "border-border"
                          }`}
                        >
                          {m === "unordered" ? "Без времени" : m === "ordered" ? "По порядку" : "Временной блок"}
                        </button>
                      ))}
                      <label className="ml-auto flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} />
                        Фиксированная
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={close}>
                    Отмена
                  </Button>
                  <Button onClick={submit} disabled={!title.trim()}>
                    Сохранить
                  </Button>
                </div>
              </div>
            )}

            {step === "ask" && (
              <div className="space-y-4">
                <p className="text-sm">Задача добавлена во «Входящие».</p>
                <Card className="bg-surface-2">
                  <p className="text-sm font-medium">
                    Нужно ли помочь правильнее сформулировать задачу?
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Помощник уточнит результат, критерий выполнения и ближайшее действие.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={runAssistant}>
                      <Sparkles className="h-4 w-4" /> Да, помочь
                    </Button>
                    <Button size="sm" variant="ghost" onClick={close}>
                      Нет, оставить как есть
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {step === "assistant" && suggestion && (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Шаблонный помощник (работает без внешнего ИИ). Примите улучшенную формулировку,
                  отредактируйте её или оставьте исходную.
                </p>
                <Field label="Улучшенная формулировка" value={suggestion.improvedTitle} />
                <Field label="Конкретный результат" value={suggestion.desiredResult} />
                <Field label="Критерий выполнения" value={suggestion.completionCriterion} />
                <Field label="Ближайшее физическое действие" value={suggestion.nextPhysicalAction} />
                <Field label="Срок" value={suggestion.realisticDueHint} />
                <Field label="Ресурсы" value={suggestion.resourceHint} />
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={close}>
                    Оставить исходную
                  </Button>
                  <Button
                    onClick={() => {
                      if (createdId) {
                        // Применяем улучшенный заголовок к созданной задаче.
                        updateTask(createdId, { title: suggestion.improvedTitle });
                      }
                      close();
                    }}
                  >
                    Принять формулировку
                  </Button>
                </div>
              </div>
            )}
          </Card>
          </motion.div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
