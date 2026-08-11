"use client";

import { APP, REGIONAL_DEFAULTS } from "@/config/app";
import { isDemoMode } from "@/lib/env";
import { Card, CardTitle } from "@/components/ui/primitives";
import { useStore } from "@/lib/demo/store";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { state, setAvailableMinutes } = useStore();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Настройки и интеграции</h1>
        <p className="mt-1 text-sm text-muted">Региональные настройки, лимиты, календари.</p>
      </header>

      {isDemoMode && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/10">
          <p className="text-sm text-[var(--warning)]">
            Демо-режим. Данные хранятся в памяти и сбрасываются при перезагрузке. Чтобы включить
            реальное хранение (PostgreSQL + RLS), задайте переменные Supabase в{" "}
            <code>.env.local</code> — см. README.
          </p>
        </Card>
      )}

      <Card>
        <CardTitle>Региональные настройки</CardTitle>
        <div className="mt-2">
          <Row label="Продукт" value={APP.name} />
          <Row label="Часовой пояс" value={REGIONAL_DEFAULTS.timezone} />
          <Row label="Формат даты" value="дд.мм.гггг" />
          <Row label="Формат времени" value="24 часа" />
          <Row label="Валюта" value={REGIONAL_DEFAULTS.currency} />
          <Row label="Начало недели" value="Понедельник" />
        </div>
      </Card>

      <Card>
        <CardTitle>Лимиты и резерв</CardTitle>
        <div className="mt-2">
          <Row label="Резерв времени" value={`${Math.round(state.reserveRatio * 100)}% (20–30%)`} />
          <Row
            label="Дневной денежный лимит"
            value={state.dailyMoneyLimitMajor === null ? "—" : `${state.dailyMoneyLimitMajor} сом`}
          />
        </div>
        <label className="mt-3 block text-xs text-muted">
          Доступное время в день (мин)
          <input
            type="number"
            min={0}
            value={state.availableMinutes}
            onChange={(e) => setAvailableMinutes(Number(e.target.value))}
            className="mt-1 w-32 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
      </Card>

      <Card>
        <CardTitle>Интеграции календарей</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Google Calendar и Microsoft Outlook. Адаптеры, OAuth-потоки (state + PKCE), выбор
          календарей, разрешение конфликтов и шифрование токенов реализованы. Подключение активно
          после добавления OAuth-ключей; без ключей кнопки вернут вас сюда (см. docs/CALENDAR_SYNC.md).
        </p>
        <div className="mt-3 flex gap-2">
          {/* Полная навигация к API-роуту OAuth (не next/link — нужен серверный редирект). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/integrations/google"
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
          >
            Подключить Google
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/integrations/microsoft"
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
          >
            Подключить Microsoft
          </a>
        </div>
      </Card>
    </div>
  );
}
