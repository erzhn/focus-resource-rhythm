-- ============================================================================
-- Двусторонняя синхронизация календарей: подключения, внешние календари,
-- связи событий, состояние sync, запросы подтверждения внешних изменений.
-- OAuth refresh-токены хранятся ТОЛЬКО на сервере в зашифрованном виде.
-- ============================================================================

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  account_email text not null,
  -- Зашифрованные токены (шифрование ключом окружения на сервере).
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[],
  status text not null default 'active' check (status in ('active','needs_reauth','disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, account_email)
);

create table if not exists public.external_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  external_id text not null,               -- id календаря у провайдера
  name text,
  selected boolean not null default false, -- импортируем ли из него
  is_default_outgoing boolean not null default false, -- календарь по умолчанию для исходящих
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

-- Связь локальной записи с внешним событием.
create table if not exists public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_calendar_id uuid not null references public.external_calendars(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  occurrence_id uuid references public.task_occurrences(id) on delete cascade,
  personal_event_id uuid references public.personal_events(id) on delete cascade,
  external_event_id text not null,
  etag text,             -- Google
  change_key text,       -- Microsoft
  external_updated_at timestamptz,
  local_updated_at timestamptz,
  last_direction text check (last_direction in ('inbound','outbound')),
  last_operation_id uuid,   -- идемпотентность
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_calendar_id, external_event_id)
);

-- Состояние инкрементальной синхронизации (sync/delta токены, срок подписки).
create table if not exists public.calendar_sync_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_calendar_id uuid not null references public.external_calendars(id) on delete cascade,
  sync_token text,                 -- Google nextSyncToken
  delta_link text,                 -- Microsoft delta
  subscription_id text,            -- webhook/notification channel
  subscription_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_calendar_id)
);

-- Запрос подтверждения внешнего изменения (было/стало, не применяем молча).
create table if not exists public.calendar_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_link_id uuid references public.calendar_event_links(id) on delete cascade,
  change_type text not null check (change_type in ('update','delete')),
  local_snapshot jsonb,
  external_snapshot jsonb,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','merged')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ext_cal_conn on public.external_calendars(connection_id);
create index if not exists idx_event_links_task on public.calendar_event_links(task_id);
create index if not exists idx_change_requests_pending
  on public.calendar_change_requests(user_id) where status = 'pending';

create trigger trg_cal_conn_updated before update on public.calendar_connections
  for each row execute function public.set_updated_at();
create trigger trg_ext_cal_updated before update on public.external_calendars
  for each row execute function public.set_updated_at();
create trigger trg_event_links_updated before update on public.calendar_event_links
  for each row execute function public.set_updated_at();
create trigger trg_sync_states_updated before update on public.calendar_sync_states
  for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;
alter table public.external_calendars enable row level security;
alter table public.calendar_event_links enable row level security;
alter table public.calendar_sync_states enable row level security;
alter table public.calendar_change_requests enable row level security;

create policy "own calendar_connections" on public.calendar_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own external_calendars" on public.external_calendars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own calendar_event_links" on public.calendar_event_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own calendar_sync_states" on public.calendar_sync_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own calendar_change_requests" on public.calendar_change_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Не более одного календаря по умолчанию для исходящих на пользователя.
create unique index if not exists uniq_default_outgoing_per_user
  on public.external_calendars(user_id) where is_default_outgoing;
