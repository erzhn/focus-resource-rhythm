# Развёртывание

Деплой в этой сессии не выполнялся (по ТЗ — без создания платных ресурсов). Ниже — подготовка.

## Предпосылки
- Проект Supabase (облачный) с применёнными миграциями из `supabase/migrations/`.
- Переменные окружения из `.env.example`, заданные в панели хостинга (не в репозитории).
- `TOKEN_ENCRYPTION_KEY` — 32-байтовый ключ (base64) для шифрования OAuth-токенов.

## Vercel (рекомендуется для Next.js)
1. Импортировать репозиторий в Vercel.
2. Указать переменные окружения (публичные `NEXT_PUBLIC_*` и серверные — раздельно).
3. Build command `next build` (по умолчанию). Node 20+.
4. После деплоя обновить OAuth redirect URIs и `APP_BASE_URL` на боевой домен.

## База данных
```bash
npx supabase link --project-ref <ref>
npx supabase db push
# seed НЕ применять в production
```

## Календарные webhook-и
Нужен публичный HTTPS. Указать `APP_BASE_URL`, зарегистрировать каналы Google push / Graph
change notifications, настроить обновление истекающих подписок (cron/фоновая задача).

## Проверка перед релизом
`npm run lint && npm run typecheck && npm test && npm run build` — всё должно проходить.
Проверить, что service-role ключ не попал в клиентский бандл и токены не логируются.
