-- Модуль «Торговля», часть 4: надёжная доставка Telegram.
--
-- Эти таблицы чинят три существующих пробела бота учёта расходов, а не только
-- готовят почву для торговых команд:
--
--   1. Код привязки хранился ОТКРЫТЫМ ТЕКСТОМ. Теперь — хеш, срок и отзыв.
--   2. update_id нигде не проверялся, и повторная доставка апдейта от Telegram
--      создавала вторую операцию. Теперь есть inbox с состояниями.
--   3. Обработка шла синхронно внутри запроса, без повторов и восстановления.
--
-- Все таблицы здесь — служебные. Клиент к ним не обращается: с ними работает
-- серверный обработчик под service-role, и он обязан сам проверять владельца
-- каждой операции, потому что service-role обходит RLS.

-- ---------------------------------------------------------------------------
-- Одноразовые токены привязки
--
-- В базе лежит только хеш: утечка таблицы не должна давать возможность
-- привязать чужой чат. Погашение атомарное — used_at ставится тем же UPDATE,
-- который проверяет срок.
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_link_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.telegram_link_tokens is
  'Одноразовые коды привязки чата. Хранится только хеш; код живёт ограниченное время.';

create index if not exists idx_tlt_user on public.telegram_link_tokens (user_id, created_at desc);
create index if not exists idx_tlt_expiry on public.telegram_link_tokens (expires_at) where used_at is null;

alter table public.telegram_link_tokens enable row level security;

-- Владелец видит, что у него есть непогашенный код, но не может прочитать
-- чужие и не может подделать свой: вставку делает серверное действие.
create policy tlt_select_own on public.telegram_link_tokens
  for select using (auth.uid() = user_id);

grant select on public.telegram_link_tokens to authenticated;
grant all on public.telegram_link_tokens to service_role;

-- Привязку теперь можно отозвать.
alter table public.telegram_links
  add column if not exists revoked_at timestamptz;

comment on column public.telegram_links.link_code is
  'УСТАРЕЛО: открытый код. Заменяется таблицей telegram_link_tokens с хешем; колонка удаляется после перехода.';

-- ---------------------------------------------------------------------------
-- Входящие обновления: inbox
--
-- Простого «записали update_id и больше не обрабатываем» недостаточно:
-- обработка могла оборваться сразу после записи идентификатора, и тогда
-- событие потерялось бы навсегда. Поэтому состояния и аренда (lease).
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_updates (
  update_id    bigint primary key,
  chat_id      bigint,
  payload      jsonb not null,
  state        text not null default 'received'
                 check (state in ('received','processing','processed','failed')),
  attempts     integer not null default 0,
  -- До какого момента апдейт считается взятым в работу. Истекла — другой
  -- обработчик вправе забрать его себе.
  lease_until  timestamptz,
  last_error   text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.telegram_updates is
  'Очередь входящих обновлений Telegram. Повтор доставки не создаёт вторую бизнес-операцию.';

create index if not exists idx_tu_pending
  on public.telegram_updates (state, lease_until nulls first, received_at)
  where state in ('received','processing');

alter table public.telegram_updates enable row level security;
-- Политик нет намеренно: таблица не предназначена для клиента.

grant all on public.telegram_updates to service_role;

/**
 * Забрать пачку необработанных обновлений.
 *
 * skip locked позволяет нескольким обработчикам работать одновременно, не
 * мешая друг другу. Истёкшая аренда означает, что предыдущая попытка не
 * завершилась, — такое обновление снова становится доступным, и событие не
 * теряется.
 */
create or replace function public.claim_telegram_updates(
  p_limit         integer default 10,
  p_lease_seconds integer default 60
)
returns setof public.telegram_updates
language sql
security definer
set search_path = public
as $$
  update public.telegram_updates u
     set state = 'processing',
         attempts = u.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds)
   where u.update_id in (
     select update_id
       from public.telegram_updates
      where state = 'received'
         or (state = 'processing' and lease_until < now())
      order by received_at
      limit p_limit
      for update skip locked
   )
  returning u.*;
$$;

revoke all on function public.claim_telegram_updates(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_updates(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Состояние диалога
--
-- Длинный диалог в боте нужно уметь продолжить и отменить. Версия защищает от
-- повторного нажатия на СТАРУЮ кнопку: действие, относящееся к прошлому шагу,
-- выполняться не должно.
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_sessions (
  chat_id       bigint primary key,
  user_id       uuid references auth.users(id) on delete cascade,
  account_id    uuid references public.trading_accounts(id) on delete set null,
  -- Какой сценарий идёт: /in, /out, /cash и так далее.
  flow          text,
  step          text,
  draft         jsonb not null default '{}'::jsonb,
  version       integer not null default 1,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now()
);

comment on table public.telegram_sessions is
  'Состояние диалога бота. version отсекает повторное нажатие на устаревшую кнопку.';

create index if not exists idx_ts_expiry on public.telegram_sessions (expires_at);

create trigger trg_ts_updated before update on public.telegram_sessions
  for each row execute function public.set_updated_at();

alter table public.telegram_sessions enable row level security;
grant all on public.telegram_sessions to service_role;

-- ---------------------------------------------------------------------------
-- Исходящие сообщения: outbox
--
-- event_key делает напоминание ровно одноразовым: ключ вида
-- «user:account:2026-10-06:evening_review» не позволит второму запуску
-- планировщика отправить то же самое ещё раз. Это важно, потому что частота
-- cron в проекте может меняться.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  chat_id      bigint,
  event_key    text not null unique,
  kind         text not null,
  body         text not null,
  payload      jsonb not null default '{}'::jsonb,
  state        text not null default 'pending'
                 check (state in ('pending','sending','sent','failed','cancelled')),
  attempts     integer not null default 0,
  lease_until  timestamptz,
  last_error   text,
  send_after   timestamptz not null default now(),
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.notification_outbox is
  'Исходящие сообщения и напоминания. event_key гарантирует, что одно и то же не уйдёт дважды.';

create index if not exists idx_outbox_pending
  on public.notification_outbox (state, send_after)
  where state in ('pending','sending');

alter table public.notification_outbox enable row level security;
grant all on public.notification_outbox to service_role;

/** Забрать пачку готовых к отправке сообщений — та же механика аренды. */
create or replace function public.claim_outbox_messages(
  p_limit         integer default 20,
  p_lease_seconds integer default 60
)
returns setof public.notification_outbox
language sql
security definer
set search_path = public
as $$
  update public.notification_outbox o
     set state = 'sending',
         attempts = o.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds)
   where o.id in (
     select id
       from public.notification_outbox
      where send_after <= now()
        and (state = 'pending' or (state = 'sending' and lease_until < now()))
      order by send_after
      limit p_limit
      for update skip locked
   )
  returning o.*;
$$;

revoke all on function public.claim_outbox_messages(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_messages(integer, integer) to service_role;
