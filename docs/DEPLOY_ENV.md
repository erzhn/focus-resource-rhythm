# Переменные окружения для деплоя (Vercel)

Памятка к деплою. Полный список с комментариями — в [`.env.example`](../.env.example);
общий процесс — в [`DEPLOYMENT.md`](./DEPLOYMENT.md). Значения задаются в
**Vercel → Project → Settings → Environment Variables** (не в репозитории).

## Минимум, чтобы приложение работало (авторизация + хранение)

| Переменная | Тип | Значение | Где взять |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | публичная | `https://<ref>.supabase.co` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | публичная | anon/public key | там же |
| `SUPABASE_SERVICE_ROLE_KEY` | **секрет** | service_role key | там же (никогда не в клиент) |
| `TOKEN_ENCRYPTION_KEY` | **секрет** | 32-байтовый ключ (base64) | сгенерировать (см. ниже) |
| `APP_BASE_URL` | публичная | `https://<ваш-домен>` | боевой домен после деплоя |

> ⚠️ **`NEXT_PUBLIC_SUPABASE_URL` — только голый origin** `https://<ref>.supabase.co`,
> **без** `/rest/v1/` и без завершающего слэша. С хвостом ломается авторизация (PGRST125).

Без переменных Supabase приложение поднимется в **демо-режиме** (данные в памяти,
без входа) — для продакшена это не годится.

## AI-ассистент (необязательно, но чат без него не работает)

| Переменная | Значение |
|---|---|
| `ASSISTANT_PROVIDER` | `gemini` (бесплатный тариф) — рекомендуется для облака |
| `GEMINI_API_KEY` | **секрет**, ключ из https://aistudio.google.com/apikey |

Провайдер по умолчанию — Ollama (локальный), в облаке недоступен, поэтому на хостинге
явно задайте `gemini`/`groq` и соответствующий ключ. Основной продукт без ключа работает —
не отвечает только вкладка «Ассистент».

## Календари Google / Microsoft (необязательно)

Нужны только для синхронизации календарей. Задать `GOOGLE_*` / `MICROSOFT_*` и
**обновить redirect URI на боевой домен**:
`https://<домен>/api/integrations/google/callback` (аналогично для microsoft).
Webhook-синхронизация требует публичного HTTPS (`APP_BASE_URL`).

## Генерация `TOKEN_ENCRYPTION_KEY`

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Чек-лист перед релизом

- [ ] Миграции применены к боевой БД: `npx supabase db push` (seed в проде НЕ применять).
- [ ] Применена миграция грантов `..._grants.sql` (иначе «permission denied» / 42501).
- [ ] Публичные (`NEXT_PUBLIC_*`) и серверные переменные заданы раздельно.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` не попал в клиентский бандл.
- [ ] После деплоя: `APP_BASE_URL` и OAuth redirect URIs указывают на боевой домен.
- [ ] Проверка Supabase Auth: включено ли подтверждение email (если да — новым
      пользователям приходит письмо; при выключенном подтверждении вход сразу).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` — зелёные.
