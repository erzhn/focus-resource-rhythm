# Синхронизация календарей (Google / Microsoft)

Статус: **адаптеры, OAuth-потоки (state+PKCE), разрешение конфликтов и шифрование токенов
реализованы и покрыты unit-тестами; активируются при наличии ключей**. Реальный обмен с
Google/Microsoft и webhook-каналы ожидают учётных данных. Основное приложение работает без
подключённых календарей.

## Реализованные модули

- `src/lib/integrations/provider.ts` — единый интерфейс `CalendarProvider`.
- `src/lib/integrations/google.ts`, `microsoft.ts` — адаптеры (OAuth, Events/Graph, sync).
- `src/app/api/integrations/[provider]/route.ts` + `callback/route.ts` — OAuth со state и PKCE.
- `src/lib/crypto/tokens.ts` — AES-256-GCM шифрование refresh-токенов (тесты).
- `src/domain/sync/conflict.ts` — правило разрешения конфликтов (тесты).
- `src/domain/sync/mapping.ts` — задача ↔ внешнее событие, структурированный блок (тесты).

## Принципы

- Оба провайдера можно подключить одновременно. Схема допускает несколько подключений в будущем.
- Импорт только из **выбранных** календарей; один календарь назначается **по умолчанию** для исходящих.
- Наружу отправляется только **подтверждённая** задача с точным временем (title, время, описание,
  проект и приоритет — в структурированном блоке описания).
- Смена календаря по умолчанию не переносит ранее отправленные задачи.

## Конфликты (уже принятое правило)

- Основной считается версия с более поздним достоверным временем изменения.
- Если новее — внешняя версия, она **не применяется молча**: создаётся `calendar_change_requests`
  со снимками «было/стало». Пользователь принимает, отклоняет или объединяет.
- До подтверждения локальные данные не перезаписываются. Внешнее удаление также требует подтверждения.
- Хранится история версий (`entity_versions`) и возможность отменить последнее изменение.

## Технически

- **Google**: OAuth 2.0 + Events API, incremental sync (`nextSyncToken`), push notifications на
  публичный HTTPS endpoint. Корректная обработка инвалидированного sync-токена → полный ресинк.
- **Microsoft Graph**: OAuth 2.0 + delta query + change notifications.
- Ручная кнопка «Синхронизировать сейчас» + фоновая периодическая синхронизация как резерв.
- Подписки/каналы имеют срок (`subscription_expires_at`) — безопасное обновление.
- Webhook не доверяет входящим данным: проверка идентификаторов/секретов + повторное получение
  изменений через API. Обработчики идемпотентны (`last_operation_id`).
- Refresh-токены — только на сервере, зашифрованы `TOKEN_ENCRYPTION_KEY`, не логируются.

## Документы для перепроверки перед реализацией

- Google Calendar sync: https://developers.google.com/workspace/calendar/api/guides/sync
- Google push: https://developers.google.com/workspace/calendar/api/guides/push
- Graph delta query: https://learn.microsoft.com/graph/delta-query-events
- Graph change notifications: https://learn.microsoft.com/graph/change-notifications-overview

## Что нельзя проверить без ключей

Реальный OAuth-обмен, live delta/webhook и двусторонний перенос событий. Для CI используются
контрактные mock-тесты; ручная проверка — по инструкции из README при наличии учётных данных.
