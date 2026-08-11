"use client";

import { useStore } from "@/lib/demo/store";
import { Card, CardTitle } from "@/components/ui/primitives";
import { checkLimit, ENERGY_BAND_LABELS, energyBand } from "@/domain/resources";
import { formatMinutes, formatMoney } from "@/lib/format";
import type { Scale1to5 } from "@/domain/types";

export default function ResourcesPage() {
  const { state, dayPlan } = useStore();

  const plannedMoney = state.tasks.reduce((s, t) => s + t.plannedMoneyMinor, 0) / 100;
  const moneyCheck = checkLimit(plannedMoney, state.dailyMoneyLimitMajor, "сом");
  const timeCheck = checkLimit(dayPlan.plannedMinutes, dayPlan.plannableMinutes, "мин");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Ресурсы</h1>
        <p className="mt-1 text-sm text-muted">Время, силы и деньги: план, факт и лимиты.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Время (день)</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{formatMinutes(dayPlan.plannedMinutes)}</p>
          <p className="text-xs text-muted">
            под планирование {formatMinutes(dayPlan.plannableMinutes)} · резерв{" "}
            {formatMinutes(dayPlan.reserveMinutes)}
          </p>
          {timeCheck.message && (
            <p className="mt-2 text-xs text-[var(--warning)]">{timeCheck.message}</p>
          )}
        </Card>
        <Card>
          <CardTitle>Деньги (день)</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{formatMoney(plannedMoney)}</p>
          <p className="text-xs text-muted">
            лимит {state.dailyMoneyLimitMajor === null ? "—" : formatMoney(state.dailyMoneyLimitMajor)}
          </p>
          {moneyCheck.message && (
            <p className="mt-2 text-xs text-[var(--warning)]">{moneyCheck.message}</p>
          )}
        </Card>
        <Card>
          <CardTitle>Силы</CardTitle>
          <p className="mt-2 text-2xl font-semibold">
            {ENERGY_BAND_LABELS[energyBand(state.morningEnergy as Scale1to5)]}
          </p>
          <p className="text-xs text-muted">утренняя оценка {state.morningEnergy} из 5</p>
        </Card>
      </div>

      <Card>
        <CardTitle>План по задачам (время / деньги)</CardTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2">Задача</th>
                <th className="pb-2 text-right">Время</th>
                <th className="pb-2 text-right">Деньги</th>
                <th className="pb-2 text-right">Силы</th>
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
    </div>
  );
}
