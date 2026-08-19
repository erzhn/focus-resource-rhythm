"use client";

import { Clock, Wallet, Zap } from "lucide-react";
import { useStore } from "@/lib/demo/store";
import { Card, CardTitle, Badge } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Reveal, RevealList, RevealItem } from "@/components/ui/reveal";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { resourceRatios } from "@/lib/ui/resource-ratios";
import { checkLimit, ENERGY_BAND_LABELS, energyBand } from "@/domain/resources";
import { formatMinutes, formatMoney } from "@/lib/format";
import type { Scale1to5 } from "@/domain/types";

export default function ResourcesPage() {
  const { state, dayPlan } = useStore();

  const plannedMoney = state.tasks.reduce((s, t) => s + t.plannedMoneyMinor, 0) / 100;
  const moneyCheck = checkLimit(plannedMoney, state.dailyMoneyLimitMajor, "сом");
  const timeCheck = checkLimit(dayPlan.plannedMinutes, dayPlan.plannableMinutes, "мин");

  const r = resourceRatios({
    plannedMinutes: dayPlan.plannedMinutes,
    plannableMinutes: dayPlan.plannableMinutes,
    plannedMoney,
    moneyLimit: state.dailyMoneyLimitMajor,
    energy: state.morningEnergy,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Баланс дня"
        title="Ресурсы"
        subtitle="Время, силы и деньги: план, факт и лимиты."
      />

      <RevealList className="grid gap-3 sm:grid-cols-3">
        <RevealItem>
          <ResourceCard
            title="Время (день)"
            icon={Clock}
            ratio={r.time.ratio}
            over={r.time.over}
            accent="var(--primary)"
            main={formatMinutes(dayPlan.plannedMinutes)}
            detail={`под планирование ${formatMinutes(dayPlan.plannableMinutes)} · резерв ${formatMinutes(dayPlan.reserveMinutes)}`}
            warning={timeCheck.message}
          />
        </RevealItem>
        <RevealItem>
          <ResourceCard
            title="Деньги (день)"
            icon={Wallet}
            ratio={r.money?.ratio ?? 0}
            over={r.money?.over ?? false}
            accent="var(--resource)"
            main={formatMoney(plannedMoney)}
            detail={`лимит ${state.dailyMoneyLimitMajor === null ? "—" : formatMoney(state.dailyMoneyLimitMajor)}`}
            warning={moneyCheck.message}
            disabled={r.money === null}
          />
        </RevealItem>
        <RevealItem>
          <ResourceCard
            title="Силы"
            icon={Zap}
            ratio={r.energy.ratio}
            over={false}
            accent="var(--energy-high)"
            main={ENERGY_BAND_LABELS[energyBand(state.morningEnergy as Scale1to5)]}
            detail={`утренняя оценка ${state.morningEnergy} из 5`}
          />
        </RevealItem>
      </RevealList>

      <Reveal className="mt-4">
        <Card>
          <CardTitle>План по задачам (время / деньги / силы)</CardTitle>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-2">
                  <th className="pb-2 font-semibold">Задача</th>
                  <th className="pb-2 text-right font-semibold">Время</th>
                  <th className="pb-2 text-right font-semibold">Деньги</th>
                  <th className="pb-2 text-right font-semibold">Силы</th>
                </tr>
              </thead>
              <tbody>
                {state.tasks.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 pr-2">{t.title}</td>
                    <td className="py-2 text-right text-muted">{formatMinutes(t.plannedMinutes)}</td>
                    <td className="py-2 text-right text-muted">
                      {t.plannedMoneyMinor > 0 ? formatMoney(t.plannedMoneyMinor / 100) : "—"}
                    </td>
                    <td className="py-2 text-right text-muted">{t.energyRequired}/5</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

function ResourceCard({
  title,
  icon: Icon,
  ratio,
  over,
  accent,
  main,
  detail,
  warning,
  disabled,
}: {
  title: string;
  icon: typeof Clock;
  ratio: number;
  over: boolean;
  accent: string;
  main: string;
  detail: string;
  warning?: string | null;
  disabled?: boolean;
}) {
  const color = over ? "var(--attention)" : accent;
  const pct = Math.round(ratio * 100);
  return (
    <Card className="h-full">
      <div className="flex items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {over && <Badge color="var(--attention)">перерасход</Badge>}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <ProgressRing value={disabled ? 0 : ratio} size={64} stroke={7} color={color}>
          <span className="text-xs font-bold" style={{ color }}>
            {disabled ? "—" : <AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} />}
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xl font-extrabold leading-tight">
            <Icon className="h-4 w-4 text-muted-2" />
            {main}
          </p>
          <p className="mt-1 text-[11px] text-muted-2">{detail}</p>
        </div>
      </div>
      {warning && <p className="mt-3 text-xs font-medium text-[var(--attention)]">{warning}</p>}
    </Card>
  );
}
