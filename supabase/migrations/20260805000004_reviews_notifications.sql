-- ============================================================================
-- Вечерние итоги, еженедельные сверки, переносы (с причиной), уведомления.
-- ============================================================================

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null,
  completed_count integer not null default 0,
  partial_count integer not null default 0,
  actual_minutes integer,
  actual_money numeric(14,2),
  spent_energy smallint check (spent_energy between 1 and 5),
  end_energy smallint check (end_energy between 1 and 5),
  blocker_note text,
  conclusion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  summary text,
  next_week_results jsonb not null default '[]'::jsonb,  -- до трёх результатов
  decisions jsonb not null default '[]'::jsonb,          -- решения по крупным планам + причины
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- Переносы задач: обязательно с причиной.
create table if not exists public.postponements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_id uuid references public.task_occurrences(id) on delete cascade,
  from_date date,
  to_date date not null,
  reason text not null check (length(btrim(reason)) > 0),  -- причина обязательна
  created_at timestamptz not null default now()
);

-- Внутренние уведомления.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,   -- plan_unconfirmed | due_soon | overdue | limit_exceeded | conflict | ...
  title text not null,
  body text,
  action_href text,     -- уведомление ведёт к конкретному действию
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id) where read_at is null;
create index if not exists idx_postponements_task on public.postponements(task_id);

create trigger trg_daily_reviews_updated before update on public.daily_reviews
  for each row execute function public.set_updated_at();
create trigger trg_weekly_reviews_updated before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

alter table public.daily_reviews enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.postponements enable row level security;
alter table public.notifications enable row level security;

create policy "own daily_reviews" on public.daily_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own weekly_reviews" on public.weekly_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own postponements" on public.postponements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
