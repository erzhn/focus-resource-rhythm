-- Модуль «Торговля», часть 3: правила, сетапы, проверки, календарь, дневник.
--
-- Главное требование к этой части — не дать статистике дисциплины обмануть
-- владельца:
--
--   • статус проверки может быть unknown, и это НЕ то же самое, что passed;
--   • этап проверки хранится отдельно, а восстановленные задним числом
--     проверки помечаются: сравнивать с результатом можно только те, что
--     сделаны ДО входа;
--   • результат сделки в оценку дисциплины не входит вовсе.

-- ---------------------------------------------------------------------------
-- Наборы правил: версионируемые, с режимом и весами
-- ---------------------------------------------------------------------------
create table if not exists public.trading_rule_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  uuid not null,
  version     integer not null default 1,
  title       text not null default 'Мои правила',
  is_current  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint trs_id_user unique (id, user_id),
  constraint trs_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade,
  constraint trs_version_unique unique (account_id, version)
);

comment on table public.trading_rule_sets is
  'Версия набора правил. Сделка хранит версию, по которой её проверяли.';

create unique index if not exists uq_trs_current
  on public.trading_rule_sets (account_id) where is_current;

create trigger trg_trs_updated before update on public.trading_rule_sets
  for each row execute function public.set_updated_at();

alter table public.trading_rule_sets enable row level security;

create policy trs_select_own on public.trading_rule_sets
  for select using (auth.uid() = user_id);
create policy trs_insert_own on public.trading_rule_sets
  for insert with check (auth.uid() = user_id);
create policy trs_update_own on public.trading_rule_sets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trs_delete_own on public.trading_rule_sets
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_rule_sets to authenticated;
grant all on public.trading_rule_sets to service_role;

-- ---------------------------------------------------------------------------
-- Отдельные правила внутри набора
--
-- rule_code — стабильный код алгоритма, реализованного в приложении. Новая
-- строка здесь не создаёт новую проверку: без реализации и теста правило
-- просто не будет вычисляться, и это честнее, чем конструктор произвольных
-- условий, который невозможно проверить.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  rule_set_id  uuid not null,
  rule_code    text not null,
  stage        text not null check (stage in ('pre_entry','in_trade','post_trade')),
  -- warn — требуется осознанное подтверждение с причиной;
  -- block_plan — план не одобряется (факт сделки записать всё равно можно).
  mode         text not null default 'warn' check (mode in ('warn','block_plan')),
  weight       numeric(8,4) not null default 1 check (weight >= 0),
  enabled      boolean not null default true,
  -- Пороги задаёт владелец. Никаких «безопасных» значений по умолчанию:
  -- подставленный процент риска выглядел бы рекомендацией.
  params       jsonb not null default '{}'::jsonb,
  title        text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint tr_id_user unique (id, user_id),
  constraint tr_set_fk foreign key (rule_set_id, user_id)
    references public.trading_rule_sets (id, user_id) on delete cascade,
  constraint tr_code_unique unique (rule_set_id, rule_code)
);

comment on table public.trading_rules is
  'Правило в наборе. rule_code соответствует реализованному алгоритму проверки.';

create trigger trg_tr_updated before update on public.trading_rules
  for each row execute function public.set_updated_at();

alter table public.trading_rules enable row level security;

create policy tr_select_own on public.trading_rules
  for select using (auth.uid() = user_id);
create policy tr_insert_own on public.trading_rules
  for insert with check (auth.uid() = user_id);
create policy tr_update_own on public.trading_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tr_delete_own on public.trading_rules
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_rules to authenticated;
grant all on public.trading_rules to service_role;

-- ---------------------------------------------------------------------------
-- Сетапы
-- ---------------------------------------------------------------------------
create table if not exists public.trading_setups (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  account_id         uuid not null,
  version            integer not null default 1,
  title              text not null,
  entry_conditions   text,
  invalidation       text,
  stop_rule          text,
  exit_plan          text,
  checklist          jsonb not null default '[]'::jsonb,
  is_current         boolean not null default true,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint tsu_id_user unique (id, user_id),
  constraint tsu_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade
);

comment on table public.trading_setups is
  'Карточка сетапа. Изменение создаёт новую версию; сделки сохраняют использованные условия.';

create index if not exists idx_tsu_account on public.trading_setups (account_id, archived_at nulls first);

create trigger trg_tsu_updated before update on public.trading_setups
  for each row execute function public.set_updated_at();

alter table public.trading_setups enable row level security;

create policy tsu_select_own on public.trading_setups
  for select using (auth.uid() = user_id);
create policy tsu_insert_own on public.trading_setups
  for insert with check (auth.uid() = user_id);
create policy tsu_update_own on public.trading_setups
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tsu_delete_own on public.trading_setups
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_setups to authenticated;
grant all on public.trading_setups to service_role;

-- ---------------------------------------------------------------------------
-- Результаты проверок
-- ---------------------------------------------------------------------------
create table if not exists public.trade_rule_evaluations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  trade_id        uuid,
  plan_id         uuid,
  rule_code       text not null,
  rule_version    integer not null,
  stage           text not null check (stage in ('pre_entry','in_trade','post_trade')),
  -- unknown — проверка не могла быть выполнена. Это НЕ passed: иначе
  -- незаполненный журнал повышал бы оценку дисциплины.
  status          text not null check (status in ('passed','failed','unknown','not_applicable')),
  weight          numeric(8,4) not null default 1 check (weight >= 0),
  -- Чего именно не хватило для вывода.
  unknown_reason  text,
  -- Данные, на которых сделан вывод: что именно сравнивалось.
  evidence        jsonb not null default '{}'::jsonb,
  -- Проверка восстановлена задним числом: для сравнения с результатом
  -- непригодна, потому что в момент входа её не было.
  reconstructed   boolean not null default false,
  evaluated_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  constraint tre_id_user unique (id, user_id),
  constraint tre_trade_fk foreign key (trade_id, user_id)
    references public.trades (id, user_id) on delete cascade,
  constraint tre_plan_fk foreign key (plan_id, user_id)
    references public.trade_plans (id, user_id) on delete cascade,
  constraint tre_target_present check (trade_id is not null or plan_id is not null),
  constraint tre_unknown_has_reason check (status <> 'unknown' or unknown_reason is not null)
);

comment on table public.trade_rule_evaluations is
  'Результат проверки правила. unknown хранит причину; reconstructed исключает из сравнения с результатом.';

create index if not exists idx_tre_trade on public.trade_rule_evaluations (trade_id, stage);
create index if not exists idx_tre_rule on public.trade_rule_evaluations (user_id, rule_code, status);

alter table public.trade_rule_evaluations enable row level security;

create policy tre_select_own on public.trade_rule_evaluations
  for select using (auth.uid() = user_id);
create policy tre_insert_own on public.trade_rule_evaluations
  for insert with check (auth.uid() = user_id);
create policy tre_update_own on public.trade_rule_evaluations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tre_delete_own on public.trade_rule_evaluations
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trade_rule_evaluations to authenticated;
grant all on public.trade_rule_evaluations to service_role;

-- ---------------------------------------------------------------------------
-- Экономический календарь (ручной ввод)
--
-- Отсутствие записи НЕ доказывает отсутствие новостей: календарь заполняется
-- вручную и заведомо неполон. Поэтому у проверки новостного окна есть статус
-- unknown, а не только passed/failed.
-- ---------------------------------------------------------------------------
create table if not exists public.economic_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  scheduled_at  timestamptz not null,
  importance    text not null default 'medium' check (importance in ('low','medium','high')),
  -- Применимость: валюта, рынок или конкретный инструмент. Макрособытие США
  -- не объявляется автоматически запретом для всех инструментов.
  currency      text,
  market_code   text references public.trading_markets(code),
  instrument_id uuid references public.trading_instruments(id) on delete cascade,
  source        text,
  checked_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ee_id_user unique (id, user_id)
);

comment on table public.economic_events is
  'Экономические события, введённые вручную. Календарь неполон — это учитывается статусом unknown.';

create index if not exists idx_ee_time on public.economic_events (user_id, scheduled_at desc);

create trigger trg_ee_updated before update on public.economic_events
  for each row execute function public.set_updated_at();

alter table public.economic_events enable row level security;

create policy ee_select_own on public.economic_events
  for select using (auth.uid() = user_id);
create policy ee_insert_own on public.economic_events
  for insert with check (auth.uid() = user_id);
create policy ee_update_own on public.economic_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ee_delete_own on public.economic_events
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.economic_events to authenticated;
grant all on public.economic_events to service_role;

-- ---------------------------------------------------------------------------
-- Дневник
--
-- day_date — ЛОКАЛЬНАЯ дата счёта, вычисленная по его IANA-зоне.
-- Утренняя запись и вечерний итог — разные состояния: наличие первой не
-- означает, что заполнен второй.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_journal_days (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  account_id       uuid not null,
  day_date         date not null,
  plan             text,
  mood             text,
  context          text,
  outcome          text,
  lesson           text,
  -- Намеренный выходной, а не пропущенный день: в статистику пропусков
  -- такие дни не попадают.
  is_day_off       boolean not null default false,
  morning_done_at  timestamptz,
  evening_done_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint tjd_id_user unique (id, user_id),
  constraint tjd_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade,
  constraint tjd_day_unique unique (account_id, day_date)
);

comment on table public.trading_journal_days is
  'День дневника по локальной дате счёта. Утренняя запись и вечерний итог отмечаются раздельно.';

create index if not exists idx_tjd_account on public.trading_journal_days (account_id, day_date desc);

create trigger trg_tjd_updated before update on public.trading_journal_days
  for each row execute function public.set_updated_at();

alter table public.trading_journal_days enable row level security;

create policy tjd_select_own on public.trading_journal_days
  for select using (auth.uid() = user_id);
create policy tjd_insert_own on public.trading_journal_days
  for insert with check (auth.uid() = user_id);
create policy tjd_update_own on public.trading_journal_days
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tjd_delete_own on public.trading_journal_days
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_journal_days to authenticated;
grant all on public.trading_journal_days to service_role;

-- ---------------------------------------------------------------------------
-- Вложения
--
-- Хранится ПУТЬ объекта в приватном бакете, а не вечный публичный URL:
-- доступ выдаётся временной ссылкой после проверки владельца.
-- ---------------------------------------------------------------------------
create table if not exists public.trade_attachments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trade_id    uuid,
  journal_id  uuid,
  object_path text not null,
  mime_type   text not null,
  size_bytes  integer not null check (size_bytes > 0),
  source      text not null default 'web' check (source in ('web','telegram')),
  created_at  timestamptz not null default now(),

  constraint ta_id_user unique (id, user_id),
  constraint ta_trade_fk foreign key (trade_id, user_id)
    references public.trades (id, user_id) on delete cascade,
  constraint ta_journal_fk foreign key (journal_id, user_id)
    references public.trading_journal_days (id, user_id) on delete cascade,
  constraint ta_target_present check (trade_id is not null or journal_id is not null),
  constraint ta_path_unique unique (object_path)
);

comment on table public.trade_attachments is
  'Скриншоты в приватном Storage. Хранится путь объекта; ссылка выдаётся временная.';

create index if not exists idx_ta_trade on public.trade_attachments (trade_id);

alter table public.trade_attachments enable row level security;

create policy ta_select_own on public.trade_attachments
  for select using (auth.uid() = user_id);
create policy ta_insert_own on public.trade_attachments
  for insert with check (auth.uid() = user_id);
create policy ta_delete_own on public.trade_attachments
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.trade_attachments to authenticated;
grant all on public.trade_attachments to service_role;
