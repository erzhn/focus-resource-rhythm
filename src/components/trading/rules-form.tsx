"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { saveRules } from "@/lib/trading/actions";
import { RULE_DEFINITIONS, type RuleCode } from "@/domain/trading/rules";

/**
 * Настройка личных правил.
 *
 * Поля порогов пустые и такими остаются, пока владелец их не заполнит.
 * Подставленные «5–8 % на сделку» выглядели бы рекомендацией, а рекомендовать
 * здесь некому: это личные ограничения, а не отраслевой стандарт.
 *
 * Включённое правило без порога не считается выполненным — оно вернёт
 * «недостаточно данных». Это видно сразу на экране.
 */

const inputCls =
  "w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-primary";

export interface RuleState {
  code: RuleCode;
  enabled: boolean;
  mode: "warn" | "block_plan";
  weight: string;
  params: Record<string, string>;
}

export function RulesForm({ accountId, initial }: { accountId: string; initial: RuleState[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleState[]>(initial);

  const update = (code: RuleCode, patch: Partial<RuleState>) =>
    setRules((list) => list.map((r) => (r.code === code ? { ...r, ...patch } : r)));

  const setParam = (code: RuleCode, key: string, value: string) =>
    setRules((list) =>
      list.map((r) => (r.code === code ? { ...r, params: { ...r.params, [key]: value } } : r)),
    );

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveRules({ accountId, rules });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Правила сохранены");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardTitle className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" /> Личные правила
      </CardTitle>
      <p className="mt-2 text-sm text-muted">
        Пороги задаёте вы. Включённое правило без порога не засчитывается выполненным — оно вернёт
        «недостаточно данных», и это будет видно в оценке дисциплины.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {RULE_DEFINITIONS.map((definition) => {
          const state = rules.find((r) => r.code === definition.code);
          if (!state) return null;
          const needsThreshold =
            state.enabled && definition.param && !state.params[definition.param.key]?.trim();

          return (
            <div
              key={definition.code}
              className={`rounded-[var(--r-sm)] border p-3 transition-colors ${
                needsThreshold
                  ? "border-[var(--warning)]/50 bg-[color-mix(in_oklab,var(--warning)_8%,transparent)]"
                  : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 items-start gap-2">
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(e) => update(definition.code, { enabled: e.target.checked })}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{definition.title}</span>
                    <span className="block text-[11px] text-muted-2">{definition.hint}</span>
                  </span>
                </label>

                {state.enabled && (
                  <div className="flex flex-wrap items-end gap-2">
                    {definition.param && (
                      <label className="block">
                        <span className="text-[11px] text-muted">{definition.param.label}</span>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <input
                            value={state.params[definition.param.key] ?? ""}
                            onChange={(e) =>
                              setParam(definition.code, definition.param!.key, e.target.value)
                            }
                            inputMode="decimal"
                            placeholder="не задан"
                            className={`${inputCls} w-24`}
                          />
                          <span className="whitespace-nowrap text-[11px] text-muted-2">
                            {definition.param.unit}
                          </span>
                        </div>
                      </label>
                    )}

                    <label className="block">
                      <span className="text-[11px] text-muted">При нарушении</span>
                      <select
                        value={state.mode}
                        onChange={(e) =>
                          update(definition.code, {
                            mode: e.target.value as "warn" | "block_plan",
                          })
                        }
                        className={`${inputCls} mt-0.5 w-44`}
                      >
                        <option value="warn">предупредить</option>
                        <option value="block_plan">не одобрять план</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[11px] text-muted">Вес</span>
                      <input
                        value={state.weight}
                        onChange={(e) => update(definition.code, { weight: e.target.value })}
                        inputMode="decimal"
                        className={`${inputCls} mt-0.5 w-16`}
                      />
                    </label>
                  </div>
                )}
              </div>

              {needsThreshold && (
                <p className="mt-2 text-[11px] text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]">
                  Порог не задан: правило будет возвращать «недостаточно данных», а не «выполнено».
                </p>
              )}
            </div>
          );
        })}

        {error && (
          <p
            role="alert"
            className="text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]"
          >
            {error}
          </p>
        )}

        <div className="pt-1">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Сохраняю…" : "Сохранить правила"}
          </Button>
        </div>
      </form>

      <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-2">
        «Не одобрять план» относится только к проверке до входа. Записать уже совершённую сделку
        можно всегда: сделка вне журнала хуже сделки с пометкой о нарушении.
      </p>
    </Card>
  );
}
