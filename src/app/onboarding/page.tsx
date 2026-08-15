"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { APP, REGIONAL_DEFAULTS, METHOD } from "@/config/app";
import { useStore } from "@/lib/demo/store";
import { Button, Card } from "@/components/ui/primitives";

export default function OnboardingPage() {
  const router = useRouter();
  const { saveOnboarding } = useStore();
  const [step, setStep] = useState(0);

  const [timezone, setTimezone] = useState<string>(REGIONAL_DEFAULTS.timezone);
  const [currency, setCurrency] = useState<string>(REGIONAL_DEFAULTS.currency);
  const [hours, setHours] = useState(8);
  const [reservePct, setReservePct] = useState(25);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [moneyLimit, setMoneyLimit] = useState<string>("3000");
  const [morningRitual, setMorningRitual] = useState("08:30");
  const [eveningRitual, setEveningRitual] = useState("21:00");

  const steps = ["Регион", "Время и резерв", "Лимиты и ритм"];

  const finish = () => {
    saveOnboarding({
      timezone,
      currency,
      availableMinutes: hours * 60,
      reserveRatio: Math.min(0.3, Math.max(0.2, reservePct / 100)),
      dailyMoneyLimitMajor: moneyLimit.trim() === "" ? null : Number(moneyLimit),
      workStart,
      workEnd,
      morningRitualAt: morningRitual,
      eveningRitualAt: eveningRitual,
    });
    router.push("/");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-4">
      <div className="mb-6">
        <h1 className="text-lg font-bold">{APP.name}</h1>
        <p className="text-sm text-muted">Первичная настройка — займёт минуту.</p>
      </div>

      {/* Прогресс шагов */}
      <div className="mb-4 flex gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={`h-1 rounded-full ${i <= step ? "bg-primary" : "bg-surface-2"}`}
            />
            <p className={`mt-1 text-[11px] ${i === step ? "text-foreground" : "text-muted"}`}>{s}</p>
          </div>
        ))}
      </div>

      <Card className="space-y-4">
        {step === 0 && (
          <>
            <Field label="Часовой пояс">
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Валюта">
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls} />
            </Field>
            <p className="text-xs text-muted">
              Формат даты дд.мм.гггг, время 24 часа, неделя с понедельника — по умолчанию.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={`Доступное время в день: ${hours} ч`}>
              <input
                type="range"
                min={1}
                max={16}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full"
              />
            </Field>
            <Field label={`Резерв времени: ${reservePct}% (20–30%)`}>
              <input
                type="range"
                min={METHOD.minTimeReserveRatio * 100}
                max={METHOD.maxTimeReserveRatio * 100}
                value={reservePct}
                onChange={(e) => setReservePct(Number(e.target.value))}
                className="w-full"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Начало дня">
                <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Конец дня">
                <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} className={inputCls} />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label={`Дневной денежный лимит (${currency}), пусто — без лимита`}>
              <input
                type="number"
                min={0}
                value={moneyLimit}
                onChange={(e) => setMoneyLimit(e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Утренний ритуал">
                <input type="time" value={morningRitual} onChange={(e) => setMorningRitual(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Вечерний ритуал">
                <input type="time" value={eveningRitual} onChange={(e) => setEveningRitual(e.target.value)} className={inputCls} />
              </Field>
            </div>
          </>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}>
            {step === 0 ? "Пропустить" : "Назад"}
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>Далее</Button>
          ) : (
            <Button onClick={finish}>
              <CheckCircle2 className="h-4 w-4" /> Готово
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
