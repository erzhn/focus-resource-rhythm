-- ============================================================================
-- Горизонты планирования, элементы плана, утренние проверки, план дня,
-- лимиты и фактические затраты ресурсов.
-- ============================================================================

-- Периоды планирования: год / 90 дней / месяц / неделя / день.
create table if not exists public.planning_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('year','quarter90','month','week','day')),
  start_date date not null,
  end_date date not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, start_date),
  check (end_date >= start_date)
);

-- Элементы плана: связь периода с целью/проектом/задачей + порядок.
create table if not exists public.planning_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null references public.planning_periods(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  is_key_result boolean not null default false,   -- ключевой результат периода
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Утренняя/вечерняя отметка уровня сил и доступного времени.
create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  morning_energy smallint check (morning_energy between 1 and 5),
  evening_energy smallint check (evening_energy between 1 and 5),
  available_minutes integer check (available_minutes >= 0),
  money_limit_override numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

-- План дня (черновик/подтверждён).
create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  status text not null default 'draft' check (status in ('draft','confirmed')),
  reserve_minutes integer,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.daily_plans(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  occurrence_id uuid references public.task_occurrences(id) on delete cascade,
  role text not null default 'secondary' check (role in ('main','secondary','recurring')),
  sort_order integer not null default 0,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_at timestamptz not null default now()
);

-- Лимиты ресурсов (день/месяц), время/деньги.
create table if not exists public.resource_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period in ('day','month')),
  resource text not null check (resource in ('time','money')),
  limit_value numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, resource)
);

-- Фактические/плановые затраты ресурсов (журнал).
create table if not exists public.resource_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  entry_date date not null,
  resource text not null check (resource in ('time','money')),
  kind text not null check (kind in ('planned','actual')),
  amount numeric(14,2) not null,   -- время в минутах, деньги в валюте
  created_at timestamptz not null default now()
);

create index if not exists idx_planning_items_period on public.planning_items(period_id);
create index if not exists idx_daily_plan_items_plan on public.daily_plan_items(plan_id);
create index if not exists idx_resource_entries_user_date on public.resource_entries(user_id, entry_date);

create trigger trg_planning_periods_updated before update on public.planning_periods
  for each row execute function public.set_updated_at();
create trigger trg_daily_checkins_updated before update on public.daily_checkins
  for each row execute function public.set_updated_at();
create trigger trg_daily_plans_updated before update on public.daily_plans
  for each row execute function public.set_updated_at();
create trigger trg_resource_limits_updated before update on public.resource_limits
  for each row execute function public.set_updated_at();

alter table public.planning_periods enable row level security;
alter table public.planning_items enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plan_items enable row level security;
alter table public.resource_limits enable row level security;
alter table public.resource_entries enable row level security;

create policy "own planning_periods" on public.planning_periods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own planning_items" on public.planning_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily_checkins" on public.daily_checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily_plans" on public.daily_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily_plan_items" on public.daily_plan_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own resource_limits" on public.resource_limits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own resource_entries" on public.resource_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
