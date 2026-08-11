-- ============================================================================
-- «Фокус — Ресурс — Ритм» — базовая схема: расширения, профиль, настройки,
-- иерархия (сферы жизни, цели, проекты, этапы).
-- Все пользовательские данные изолированы по user_id, RLS включён.
-- Метки времени — timestamptz (UTC). Деньги — numeric, не float.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Общая функция для автообновления updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Зоны фокуса и статусы как перечислимые типы.
do $$ begin
  create type public.focus_zone as enum ('now', 'next', 'later', 'declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum
    ('inbox', 'planned', 'in_progress', 'done', 'partial', 'postponed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scheduling_mode as enum ('unordered', 'ordered', 'timeblock');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles: 1:1 с auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_settings: региональные настройки, лимиты, ритуалы
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Bishkek',
  currency text not null default 'KGS',
  week_starts_on smallint not null default 1,
  time_reserve_ratio numeric(4,3) not null default 0.250
    check (time_reserve_ratio >= 0.20 and time_reserve_ratio <= 0.30),
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  morning_ritual_at time not null default '08:30',
  evening_ritual_at time not null default '21:00',
  daily_minutes_limit integer,
  daily_money_limit numeric(14,2),
  monthly_money_limit numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Иерархия: life_areas → goals → projects → project_stages
-- ---------------------------------------------------------------------------
create table if not exists public.life_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  life_area_id uuid references public.life_areas(id) on delete set null,
  title text not null,
  description text,
  zone public.focus_zone not null default 'later',
  horizon_days integer,               -- напр. 90 для главного результата
  target_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  life_area_id uuid references public.life_areas(id) on delete set null,
  title text not null,
  description text,
  zone public.focus_zone not null default 'later',
  target_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goals_user_zone on public.goals(user_id, zone);
create index if not exists idx_projects_user_zone on public.projects(user_id, zone);
create index if not exists idx_project_stages_project on public.project_stages(project_id);

-- updated_at триггеры
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();
create trigger trg_life_areas_updated before update on public.life_areas
  for each row execute function public.set_updated_at();
create trigger trg_goals_updated before update on public.goals
  for each row execute function public.set_updated_at();
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();
create trigger trg_project_stages_updated before update on public.project_stages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.life_areas enable row level security;
alter table public.goals enable row level security;
alter table public.projects enable row level security;
alter table public.project_stages enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own life_areas" on public.life_areas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own project_stages" on public.project_stages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Автосоздание профиля и настроек при регистрации пользователя.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
