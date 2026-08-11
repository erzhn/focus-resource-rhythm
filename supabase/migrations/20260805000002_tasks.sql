-- ============================================================================
-- Задачи, зависимости, правила повторения, отдельные выполнения, события.
-- ============================================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  life_area_id uuid references public.life_areas(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  stage_id uuid references public.project_stages(id) on delete set null,
  recurrence_rule_id uuid,  -- FK добавляется ниже (после создания таблицы правил)

  title text not null,
  description text,
  status public.task_status not null default 'inbox',

  due_date date,
  importance smallint not null default 3 check (importance between 1 and 5),
  consequence smallint not null default 3 check (consequence between 1 and 5),
  goal_link smallint not null default 3 check (goal_link between 1 and 5),
  energy_required smallint not null default 3 check (energy_required between 1 and 5),

  planned_minutes integer not null default 30 check (planned_minutes >= 0),
  actual_minutes integer check (actual_minutes >= 0),
  planned_money numeric(14,2) not null default 0 check (planned_money >= 0),
  actual_money numeric(14,2),

  scheduling_mode public.scheduling_mode not null default 'unordered',
  fixed boolean not null default false,     -- фиксированная или гибкая
  is_recurring boolean not null default false,

  expected_result text,
  completion_criterion text,
  next_action text,

  -- Приоритет: системный кэш и ручное значение (хранятся раздельно).
  system_priority smallint check (system_priority between 0 and 100),
  manual_priority smallint check (manual_priority between 0 and 100),
  manual_priority_note text,
  manual_priority_at timestamptz,

  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Зависимости между задачами (task зависит от depends_on_task).
create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)   -- запрет прямой самозависимости
);

-- Правила повторения (хранятся отдельно от отдельных выполнений).
create table if not exists public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  frequency text not null
    check (frequency in ('daily','weekly','monthly_date','monthly_rule','interval')),
  interval_days integer check (interval_days >= 1),
  weekdays smallint[],                 -- 0..6
  month_day smallint check (month_day between 1 and 31),
  monthly_ordinal text check (monthly_ordinal in ('1','2','3','4','last')),
  monthly_weekday smallint check (monthly_weekday between 0 and 6),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add constraint fk_tasks_recurrence
  foreign key (recurrence_rule_id) references public.recurrence_rules(id) on delete set null;

-- Отдельные выполнения повторяющейся задачи (перенос/отмена одного экземпляра).
create table if not exists public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,           -- дата экземпляра по правилу
  status public.task_status not null default 'planned',
  moved_to_date date,                      -- если перенесён отдельный экземпляр
  is_exception boolean not null default false,  -- исключён из серии (перенос/отмена/пропуск)
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, occurrence_date)
);

-- Личные события: фиксированные и гибкие.
create table if not exists public.personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  blocks_availability boolean not null default true,  -- all-day не всегда занимает весь день
  fixed boolean not null default true,                -- импортированные считаем фиксированными
  source text not null default 'local',               -- local | google | microsoft
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index if not exists idx_tasks_user_status on public.tasks(user_id, status);
create index if not exists idx_tasks_user_due on public.tasks(user_id, due_date);
create index if not exists idx_task_deps_task on public.task_dependencies(task_id);
create index if not exists idx_occurrences_task_date on public.task_occurrences(task_id, occurrence_date);
create index if not exists idx_events_user_range on public.personal_events(user_id, starts_at, ends_at);

create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger trg_recurrence_updated before update on public.recurrence_rules
  for each row execute function public.set_updated_at();
create trigger trg_occurrences_updated before update on public.task_occurrences
  for each row execute function public.set_updated_at();
create trigger trg_events_updated before update on public.personal_events
  for each row execute function public.set_updated_at();

-- RLS
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.personal_events enable row level security;

create policy "own tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own task_dependencies" on public.task_dependencies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own recurrence_rules" on public.recurrence_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own task_occurrences" on public.task_occurrences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own personal_events" on public.personal_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Защита от циклических зависимостей задач (обнаружение цикла через рекурсию).
create or replace function public.prevent_task_dependency_cycle()
returns trigger
language plpgsql
as $$
begin
  if exists (
    with recursive chain as (
      select new.depends_on_task_id as node
      union all
      select d.depends_on_task_id
      from public.task_dependencies d
      join chain c on d.task_id = c.node
    )
    select 1 from chain where node = new.task_id
  ) then
    raise exception 'Циклическая зависимость задач запрещена';
  end if;
  return new;
end;
$$;

create trigger trg_task_dep_no_cycle
  before insert or update on public.task_dependencies
  for each row execute function public.prevent_task_dependency_cycle();
