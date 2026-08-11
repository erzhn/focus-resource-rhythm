-- ============================================================================
-- История версий сущностей и журнал значимых действий (для отмены и аналитики).
-- ============================================================================

create table if not exists public.entity_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,       -- 'task' | 'personal_event' | ...
  entity_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  source text not null default 'local',   -- local | google | microsoft
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, version)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,            -- напр. priority.override, plan.confirm, sync.apply
  entity_type text,
  entity_id uuid,
  details jsonb,                   -- журналируемое объяснение (без секретов/токенов)
  created_at timestamptz not null default now()
);

create index if not exists idx_entity_versions_entity
  on public.entity_versions(entity_type, entity_id);
create index if not exists idx_audit_user_created on public.audit_log(user_id, created_at desc);

alter table public.entity_versions enable row level security;
alter table public.audit_log enable row level security;

create policy "own entity_versions" on public.entity_versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own audit_log" on public.audit_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
