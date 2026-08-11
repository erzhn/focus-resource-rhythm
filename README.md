# Фокус — Ресурс — Ритм

Личная система планирования по авторской методике: **важное не вытесняется срочным**.
Собирает планы, помогает выбрать одно главное дело на день, планирует не только время, но и
силы и деньги, и даёт объяснимые рекомендации по приоритетам.

> Работающее веб-приложение (Next.js + TypeScript). Доменная логика методики покрыта тестами.
> Хранение — PostgreSQL через Supabase (RLS). Без ключей приложение запускается в **демо-режиме**
> с данными в памяти (явно обозначен в интерфейсе).

## Возможности (реализовано и проверено)

- **Сегодня** — утренняя проверка (силы, время), одно главное дело + до двух дополнительных +
  обязательные повторяющиеся, резерв времени 25%, предупреждения о перегрузке и нехватке сил,
  подтверждение плана дня.
- **Зоны фокуса** «Сейчас / Следом / Позже / Отказ» и **лимит трёх активных результатов** с вариантами
  освобождения фокуса.
- **Объяснимый приоритет 0–100** с разбором факторов и человеческим объяснением; ручной приоритет
  отдельно от системного.
- **Быстрое добавление задачи** + обязательный вопрос «Нужно ли помочь сформулировать?» + шаблонный
  помощник (без внешнего ИИ).
- **Ресурсы** — план/факт и лимиты времени, сил и денег (валюта KGS).
- **Уведомления**, ведущие к конкретному действию.
- Адаптивно: телефон и компьютер, светлая/тёмная тема.

## Технологии

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Supabase (PostgreSQL + Auth, RLS) ·
Zod · date-fns · lucide-react · Vitest.

## Требования

- Node.js 20+ (проверено на 24). npm 10+.
- Для реального хранения — проект Supabase (облачный) **или** Supabase CLI + Docker для локального.
- Windows PowerShell поддерживается (пути не захардкожены).

## Быстрый старт (демо-режим, без базы)

```bash
npm install
npm run dev
```

Откройте http://localhost:3000 — приложение работает на демо-данных в памяти. В интерфейсе виден
баннер «Демо-режим».

## Полный запуск с реальным хранением (Supabase)

1. **Установить зависимости**
   ```bash
   npm install
   ```
2. **Создать проект Supabase** (облако: https://supabase.com) или локально:
   ```bash
   npx supabase start
   ```
3. **Применить миграции** (поднимают всю схему и RLS на чистой базе):
   ```bash
   npx supabase db push
   ```
   либо примените SQL-файлы из `supabase/migrations/` по порядку.
4. **Загрузить демонстрационный seed** (не для production):
   ```bash
   npx supabase db execute --file supabase/seed.sql
   ```
5. **Заполнить `.env.local`** (скопируйте из `.env.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # только сервер
   TOKEN_ENCRYPTION_KEY=...             # 32-байтовый ключ (base64)
   ```
6. **Запустить**
   ```bash
   npm run dev
   ```

## Проверки качества

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (доменная логика)
npm run build        # production build
```

Текущее состояние: lint ✓, typecheck ✓, 44 unit-теста ✓, production build ✓.

## Настройка Google OAuth (Этап 6)

1. Google Cloud Console → создать OAuth 2.0 Client (Web).
2. Redirect URI: `http://localhost:3000/api/integrations/google/callback`.
3. Включить Google Calendar API, запросить минимальные scopes (события).
4. Значения — в `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. Подробности потоков, incremental sync (`nextSyncToken`) и push-уведомлений — в
   [docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md).

## Настройка Microsoft OAuth

1. Azure Portal → App registrations → новый клиент.
2. Redirect URI: `http://localhost:3000/api/integrations/microsoft/callback`.
3. Разрешения Microsoft Graph (Calendars.ReadWrite), delta query + change notifications.
4. Значения — в `.env.local`.

## Локальные webhook-и

Google/Microsoft push-уведомления требуют публичного HTTPS endpoint. Локально используйте туннель
(например `ngrok`) и укажите `APP_BASE_URL`. Как резерв работает периодическая фоновая синхронизация —
webhook не является единственным механизмом.

## Устранение типичных ошибок

- **Кириллица «квадратиками»** — шрифт Geist без кириллицы, используется системный fallback; это норма.
- **Пусто после перезагрузки** — вы в демо-режиме (данные в памяти). Подключите Supabase.
- **RLS «нет доступа»** — проверьте, что запрос идёт от аутентифицированного пользователя; политики
  разрешают только свои записи (`auth.uid() = user_id`).

## Структура

```
src/
  config/app.ts            # имя продукта, региональные настройки, правила методики
  domain/                  # чистая логика (тесты рядом)
    priority/ focus/ recurrence/ resources/ schedule/ planning/ formulation/
  lib/                     # format, env, демо-стор и seed
  components/              # UI-оболочка, быстрое добавление, строка задачи
  app/                     # экраны (App Router)
supabase/migrations/       # SQL-схема + RLS
docs/                      # архитектура, модель данных, алгоритм, синхронизация, тесты
```

Полный список требований — [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).
