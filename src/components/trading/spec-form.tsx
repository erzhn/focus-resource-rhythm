"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button, Card, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { saveSpec } from "@/lib/trading/actions";
import { VOLUME_UNIT_LABELS, type VolumeUnit } from "@/domain/trading/types";

/**
 * Настройка спецификации инструмента на счёте.
 *
 * Поля намеренно пустые. Подставить «обычный» размер контракта нельзя: у
 * разных брокеров он разный, а правдоподобное вымышленное число опаснее
 * честного «нужно настроить» — по нему посчитается риск, которому незачем
 * верить.
 *
 * Сохранение создаёт НОВУЮ версию. Прежние остаются: сделки ссылаются на
 * снимок, и правка множителя задним числом изменила бы их P/L.
 */

const inputCls =
  "mt-1 w-full rounded-[var(--r-sm)] border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

export interface InstrumentOption {
  id: string;
  code: string;
  display_name: string;
  market_code: string;
  quote_currency: string;
}

export function SpecForm({
  accountId,
  instruments,
  markets,
}: {
  accountId: string;
  instruments: InstrumentOption[];
  markets: { code: string; title: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [marketCode, setMarketCode] = useState(markets[0]?.code ?? "");
  const [instrumentId, setInstrumentId] = useState("");
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>("lot");
  const [values, setValues] = useState({
    quoteCurrency: "",
    contractMultiplier: "",
    minVolume: "",
    volumeStep: "",
    maxVolume: "",
    minCloseVolume: "",
    minRemainingVolume: "",
    priceStep: "",
  });

  // Смена рынка сбрасывает несовместимый инструмент: параметры золота не
  // должны достаться акции.
  const forMarket = instruments.filter((i) => i.market_code === marketCode);
  const selected = forMarket.find((i) => i.id === instrumentId) ?? null;

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = () => {
    setError(null);
    if (!instrumentId) {
      setError("Выберите инструмент.");
      return;
    }
    startTransition(async () => {
      const result = await saveSpec({
        accountId,
        instrumentId,
        volumeUnit,
        quoteCurrency: values.quoteCurrency || selected?.quote_currency || "USD",
        contractMultiplier: values.contractMultiplier,
        minVolume: values.minVolume,
        volumeStep: values.volumeStep,
        maxVolume: values.maxVolume,
        minCloseVolume: values.minCloseVolume,
        minRemainingVolume: values.minRemainingVolume,
        priceStep: values.priceStep,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Спецификация ${selected?.code ?? ""} сохранена`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardTitle className="flex items-center gap-1.5">
        <Settings2 className="h-3.5 w-3.5" /> Спецификация инструмента
      </CardTitle>
      <p className="mt-2 text-sm text-muted">
        Значения берутся из условий вашего брокера. Пустые поля ничем не заполняются: без них
        расчёт риска был бы вымыслом.
      </p>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
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
            {markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-muted">Инструмент</span>
          <select
            value={instrumentId}
            onChange={(e) => {
              setInstrumentId(e.target.value);
              const next = forMarket.find((i) => i.id === e.target.value);
              if (next) setValues((v) => ({ ...v, quoteCurrency: next.quote_currency }));
            }}
            className={inputCls}
          >
            <option value="">— выберите —</option>
            {forMarket.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} · {i.display_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">Единица объёма</span>
          <select
            value={volumeUnit}
            onChange={(e) => setVolumeUnit(e.target.value as VolumeUnit)}
            className={inputCls}
          >
            {(Object.keys(VOLUME_UNIT_LABELS) as VolumeUnit[]).map((u) => (
              <option key={u} value={u}>
                {VOLUME_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </label>

        <Num label="Валюта котировки" value={values.quoteCurrency} onChange={set("quoteCurrency")} text />
        <Num
          label="Множитель контракта"
          hint="Во что превращается изменение цены на 1"
          value={values.contractMultiplier}
          onChange={set("contractMultiplier")}
        />
        <Num label="Минимальный объём" value={values.minVolume} onChange={set("minVolume")} />
        <Num label="Шаг объёма" value={values.volumeStep} onChange={set("volumeStep")} />
        <Num label="Максимальный объём" hint="можно не задавать" value={values.maxVolume} onChange={set("maxVolume")} />
        <Num label="Мин. объём закрытия" value={values.minCloseVolume} onChange={set("minCloseVolume")} />
        <Num label="Мин. остаток" value={values.minRemainingVolume} onChange={set("minRemainingVolume")} />
        <Num label="Шаг цены" value={values.priceStep} onChange={set("priceStep")} />

        {error && (
          <p
            role="alert"
            className="text-xs font-medium text-[color-mix(in_oklab,var(--attention)_58%,var(--foreground))] sm:col-span-3"
          >
            {error}
          </p>
        )}

        <div className="sm:col-span-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Сохраняю…" : "Сохранить версию"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Num({
  label,
  hint,
  value,
  onChange,
  text = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  text?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        value={value}
        onChange={onChange}
        inputMode={text ? undefined : "decimal"}
        placeholder="не задано"
        className={inputCls}
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-2">{hint}</span>}
    </label>
  );
}
