"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { previewPlan, recordTrade, type PlanPreview } from "@/lib/trading/actions";
import { DIRECTION_LABELS } from "@/domain/trading/format";
import { VOLUME_UNIT_LABELS, type VolumeUnit } from "@/domain/trading/types";

/**
 * Проверка плана и запись факта входа.
 *
 * Две кнопки, а не одна, потому что это два разных события: расчёт можно
 * посмотреть сколько угодно раз, и позиция от этого не открывается. Запись
 * факта требует отдельного подтверждения с ценой и временем.
 *
 * Отказ в одобрении плана не блокирует запись: сделка, которая уже совершена,
 * должна попасть в журнал вместе с нарушением, а не остаться вне его.
 */

const inputCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

export interface SpecOption {
  instrument_id: string;
  instrument_code: string;
  instrument_name: string;
  market_code: string;
  quote_currency: string;
  volume_unit: VolumeUnit;
  is_configured: boolean;
}

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TradeForm({
  accountId,
  accountCurrency,
  specs,
  markets,
}: {
  accountId: string;
  accountCurrency: string;
  specs: SpecOption[];
  markets: { code: string; title: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const usable = specs.filter((s) => s.is_configured);
  const marketsWithSpecs = markets.filter((m) => usable.some((s) => s.market_code === m.code));

  const [marketCode, setMarketCode] = useState(marketsWithSpecs[0]?.code ?? "");
  const [instrumentId, setInstrumentId] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [initialStop, setInitialStop] = useState("");
  const [target, setTarget] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [riskBudget, setRiskBudget] = useState("");
  const [openedAt, setOpenedAt] = useState(nowLocalInput);
  const [entryMode, setEntryMode] = useState<"planned" | "historical">("planned");
  const [notes, setNotes] = useState("");

  // Расчёт хранится вместе со слепком полей, из которых получен: показывать
  // числа, не соответствующие форме, нельзя — они выглядели бы проверенными.
  const [preview, setPreview] = useState<{ key: string; data: PlanPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const forMarket = usable.filter((s) => s.market_code === marketCode);
  const spec = forMarket.find((s) => s.instrument_id === instrumentId) ?? null;
  const needsFx = spec !== null && spec.quote_currency.toUpperCase() !== accountCurrency.toUpperCase();

  const ready = Boolean(instrumentId && entryPrice && quantity);
  const formKey = JSON.stringify([
    instrumentId, direction, entryPrice, quantity, initialStop, target, fxRate, riskBudget,
  ]);
  const latest = useRef(0);

  // Расчёт обновляется сам, но ничего не записывает: смотреть на цифры можно
  // сколько угодно.
  useEffect(() => {
    if (!ready) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setChecking(true);
      const result = await previewPlan({
        accountId,
        instrumentId,
        direction,
        entryPrice,
        quantity,
        initialStop,
        target,
        fxRate,
        riskBudget,
      });
      // Ответ на устаревший запрос игнорируем: пользователь уже правил поля.
      if (id !== latest.current) return;
      setChecking(false);
      setPreview(result.ok ? { key: formKey, data: result.data } : null);
      setError(result.ok ? null : result.error);
    }, 350);
    return () => clearTimeout(timer);
  }, [accountId, instrumentId, direction, entryPrice, quantity, initialStop, target, fxRate, riskBudget, ready, formKey]);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await recordTrade({
        accountId,
        instrumentId,
        direction,
        entryPrice,
        quantity,
        initialStop,
        target,
        fxRate,
        riskBudget,
        openedAt,
        entryMode,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Факт входа записан");
      router.push(`/trading/trades/${result.data}`);
    });
  };

  if (usable.length === 0) {
    return (
      <Card>
        <CardTitle>Нужна спецификация</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Ни для одного инструмента на этом счёте не настроена спецификация. Без множителя
          контракта и объёмной сетки риск посчитать не из чего.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardTitle>Параметры сделки</CardTitle>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted">Рынок</span>
            <select
              value={marketCode}
              onChange={(e) => {
                setMarketCode(e.target.value);
                setInstrumentId("");
              }}
              className={inputCls}
            >
              {marketsWithSpecs.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted">Инструмент</span>
            <select
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
              className={inputCls}
            >
              <option value="">— выберите —</option>
              {forMarket.map((s) => (
                <option key={s.instrument_id} value={s.instrument_id}>
                  {s.instrument_code} · {s.instrument_name}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2">
            <span className="text-xs font-medium text-muted">Направление</span>
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Направление">
              {(["long", "short"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={direction === d}
                  onClick={() => setDirection(d)}
                  className={`min-h-[36px] flex-1 rounded-lg border px-2 text-xs font-medium transition-colors ${
                    direction === d
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border hover:bg-surface-2"
                  }`}
                >
                  {DIRECTION_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <Num label="Цена входа" value={entryPrice} onChange={setEntryPrice} />
          <Num
            label={`Объём${spec ? `, ${VOLUME_UNIT_LABELS[spec.volume_unit].toLowerCase()}` : ""}`}
            value={quantity}
            onChange={setQuantity}
          />
          <Num label="Исходный стоп" hint="без него план не одобряется" value={initialStop} onChange={setInitialStop} />
          <Num label="Цель" hint="необязательно" value={target} onChange={setTarget} />

          {needsFx && (
            <Num
              label={`Курс ${spec!.quote_currency} → ${accountCurrency}`}
              hint="без курса денежные величины останутся неизвестными"
              value={fxRate}
              onChange={setFxRate}
            />
          )}

          <Num label="Лимит риска на сделку" hint={`в ${accountCurrency}`} value={riskBudget} onChange={setRiskBudget} />

          <label className="block">
            <span className="text-xs font-medium text-muted">Время входа</span>
            <input
              type="datetime-local"
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted">Как записываем</span>
            <select
              value={entryMode}
              onChange={(e) => setEntryMode(e.target.value as "planned" | "historical")}
              className={inputCls}
            >
              <option value="planned">Сейчас, по плану</option>
              <option value="historical">Задним числом</option>
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-muted">Заметка</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
        </div>

        {entryMode === "historical" && (
          <p className="mt-3 text-xs text-muted">
            Запись задним числом: баланс на момент входа не восстанавливается, поэтому доля риска
            останется неизвестной. Проверка перед входом такой записи не приписывается.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))]"
          >
            {error}
          </p>
        )}

        <div className="mt-4">
          <Button size="sm" onClick={save} disabled={pending || !ready}>
            {pending ? "Записываю…" : "Записать факт входа"}
          </Button>
        </div>
      </Card>

      <PreviewPanel
        preview={preview && preview.key === formKey ? preview.data : null}
        checking={checking}
        ready={ready}
        accountCurrency={accountCurrency}
      />
    </div>
  );
}

function PreviewPanel({
  preview,
  checking,
  ready,
  accountCurrency,
}: {
  preview: PlanPreview | null;
  checking: boolean;
  ready: boolean;
  accountCurrency: string;
}) {
  return (
    <Card className="h-fit lg:sticky lg:top-4">
      <CardTitle>Проверка плана</CardTitle>

      {!ready && (
        <p className="mt-2 text-sm text-muted">
          Заполните инструмент, цену входа и объём — расчёт появится здесь.
        </p>
      )}

      {ready && !preview && (
        <p className="mt-2 text-sm text-muted">{checking ? "Считаю…" : "Расчёт недоступен."}</p>
      )}

      {preview && (
        <div className="mt-3 space-y-3">
          <div
            className={`flex items-start gap-2 rounded-[var(--r-sm)] p-3 text-sm ${
              preview.approved
                ? "bg-[color-mix(in_oklab,var(--resource)_12%,transparent)]"
                : "bg-[color-mix(in_oklab,var(--attention)_12%,transparent)]"
            }`}
          >
            {preview.approved ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--resource)]" />
            ) : (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--attention)]" />
            )}
            <span>
              {preview.approved
                ? "План проверен. Это проверка расчёта, а не разрешение на вход."
                : "План не одобрен. Факт уже совершённой сделки записать всё равно можно."}
            </span>
          </div>

          <dl className="space-y-2 text-sm">
            <Row label="Риск до стопа" value={preview.riskAccount} suffix={accountCurrency} />
            <Row label="Доля от баланса" value={preview.riskPct} suffix="%" />
            <Row label="Плановое R/R" value={preview.plannedRr} />
            <Row label="Допустимый объём" value={preview.maxVolume} hint={preview.maxVolumeReason} />
          </dl>

          {preview.issues.length > 0 && (
            <ul className="space-y-1.5 border-t border-border pt-3">
              {preview.issues.map((issue) => (
                <li key={issue.code} className="flex items-start gap-1.5 text-xs">
                  <TriangleAlert
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      issue.severity === "block" ? "text-[var(--attention)]" : "text-[var(--warning)]"
                    }`}
                  />
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: string | null;
  suffix?: string;
  hint?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        {value === null ? (
          <span className="text-xs text-muted-2" title={hint ?? undefined}>
            неизвестно
          </span>
        ) : (
          <span className="font-semibold tabular-nums">
            {value}
            {suffix ? ` ${suffix}` : ""}
          </span>
        )}
      </dd>
    </div>
  );
}

function Num({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className={inputCls}
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-2">{hint}</span>}
    </label>
  );
}
