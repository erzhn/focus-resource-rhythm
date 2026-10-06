-- Модуль «Торговля», часть 2: планы, сделки, выходы, события и деньги.
--
-- Ключевая идея схемы — РАЗДЕЛЕНИЕ ТРЁХ ВЕЩЕЙ:
--
--   1. План (trade_plans) — то, что собирались сделать. Просмотр расчёта сам
--      по себе сделки не создаёт.
--   2. Факт (trades) — то, что произошло. Пишется всегда, даже с нарушениями
--      и неполными данными: сделка вне журнала хуже сделки с пометкой.
--   3. Снимок на момент входа — спецификация, курс, исходный стоп и баланс.
--      Он неизменяем: правка настроек не переписывает историю.

-- ---------------------------------------------------------------------------
-- Планы
-- ---------------------------------------------------------------------------
create table if not exists public.trade_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  account_id        uuid not null,
  instrument_id     uuid not null references public.trading_instruments(id) on delete restrict,
  spec_id           uuid references public.trading_instrument_specs(id) on delete set null,

  direction         text not null check (direction in ('long','short')),
  planned_entry     numeric(20,8) not null check (planned_entry > 0),
  planned_stop      numeric(20,8),
  planned_target    numeric(20,8),
  planned_quantity  numeric(20,8) check (planned_quantity > 0),

  setup_id          uuid,
  emotion           text,
  exit_plan         text,

  -- Результат проверки на момент создания плана. 'approved' не означает
  -- «можно входить»: приложение не ставит стоп у брокера и не управляет
  -- реальным ордером.
  status            text not null default 'draft'
                      check (status in ('draft','approved','rejected','postponed','cancelled','executed')),
  checked_at        timestamptz,
  decision_reason   text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint trade_plans_id_user unique (id, user_id),
  constraint trade_plans_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade
);

comment on table public.trade_plans is
  'План сделки до входа. Одобрение плана — это проверка расчёта, а не разрешение на вход.';

create index if not exists idx_trade_plans_account
  on public.trade_plans (account_id, created_at desc);

create trigger trg_trade_plans_updated before update on public.trade_plans
  for each row execute function public.set_updated_at();

alter table public.trade_plans enable row level security;

create policy trade_plans_select_own on public.trade_plans
  for select using (auth.uid() = user_id);
create policy trade_plans_insert_own on public.trade_plans
  for insert with check (auth.uid() = user_id);
create policy trade_plans_update_own on public.trade_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trade_plans_delete_own on public.trade_plans
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trade_plans to authenticated;
grant all on public.trade_plans to service_role;

-- ---------------------------------------------------------------------------
-- Сделки
-- ---------------------------------------------------------------------------
create table if not exists public.trades (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  account_id             uuid not null,
  instrument_id          uuid not null references public.trading_instruments(id) on delete restrict,
  plan_id                uuid,

  direction              text not null check (direction in ('long','short')),
  entry_price            numeric(20,8) not null check (entry_price > 0),
  quantity               numeric(20,8) not null check (quantity > 0),
  opened_at              timestamptz not null,
  closed_at              timestamptz,

  -- Исходный стоп НЕ меняется никогда: от него считается начальный риск и все
  -- исторические R. Перенос стопа живёт в trade_events и в current_stop.
  initial_stop           numeric(20,8),
  current_stop           numeric(20,8),
  target                 numeric(20,8),

  ---------------------------------------------------------------------------
  -- Снимок на момент входа. Не обновляется при изменении настроек.
  ---------------------------------------------------------------------------
  spec_id                uuid,
  spec_version           integer,
  spec_calc_model        text not null default 'unsupported'
                           check (spec_calc_model in ('linear','unsupported')),
  spec_volume_unit       text not null check (spec_volume_unit in ('lot','share','coin','contract')),
  spec_contract_multiplier numeric(20,8),
  spec_quote_currency    text not null,
  spec_volume_step       numeric(20,8),
  spec_min_close_volume  numeric(20,8),
  spec_min_remaining_volume numeric(20,8),
  -- Курс валюты котировки к валюте счёта на момент входа. null — неизвестен,
  -- и тогда денежные метрики остаются неизвестными, а не считаются по 1:1.
  fx_at_entry            numeric(24,12) check (fx_at_entry is null or fx_at_entry > 0),
  fx_at_entry_estimated  boolean not null default false,
  -- Баланс непосредственно перед входом, со ссылкой на достоверность.
  balance_at_entry       numeric(20,8),
  balance_at_entry_source text check (balance_at_entry_source in ('computed','manual','unknown')),
  account_timezone       text not null default 'Asia/Bishkek',
  rule_set_id            uuid,
  rule_set_version       integer,
  exit_plan              text,
  -- Локальная дата входа по зоне счёта: по ней считаются дневные лимиты и
  -- дневник. Храним явно, чтобы отчёты не пересчитывали зону на каждый запрос.
  local_date             date not null,

  ---------------------------------------------------------------------------
  -- Производные значения. Пишутся сервером из одного ядра расчётов
  -- (src/domain/trading) в той же транзакции, что и породившее их событие.
  -- SQL их только агрегирует и никогда не выводит заново: вторая реализация
  -- формул рано или поздно разошлась бы с первой.
  --
  -- null означает «неизвестно» с причиной в unknown_reason, а не ноль.
  ---------------------------------------------------------------------------
  initial_distance       numeric(20,8),
  initial_risk_quote     numeric(20,8),
  initial_risk_account   numeric(20,8),
  risk_pct               numeric(12,6),
  planned_rr             numeric(14,10),
  gross_realized_account numeric(20,8),
  adjustments_account    numeric(20,8) not null default 0,
  net_realized_account   numeric(20,8),
  final_r                numeric(14,10),
  avg_exit_price         numeric(20,8),
  remaining_quantity     numeric(20,8) not null,
  unknown_reason         text,

  -- Ценовая экскурсия: про цену, а не про стоимость позиции.
  mfe_price              numeric(20,8),
  mae_price              numeric(20,8),
  excursion_source       text check (excursion_source in ('manual','imported','market_data')),
  excursion_estimated    boolean not null default false,

  ---------------------------------------------------------------------------
  -- Происхождение записи
  ---------------------------------------------------------------------------
  status                 text not null default 'open'
                           check (status in ('open','closed','voided')),
  -- Как запись попала в журнал. 'historical' — внесена задним числом, и
  -- выдавать её чеклист за проверку до входа нельзя.
  entry_mode             text not null default 'planned'
                           check (entry_mode in ('planned','historical','imported')),
  source                 text not null default 'web' check (source in ('web','telegram','import')),
  -- Время создания записи отдельно от времени сделки: разница показывает,
  -- насколько поздно велся журнал.
  recorded_at            timestamptz not null default now(),
  checked_at             timestamptz,
  void_reason            text,

  setup_id               uuid,
  emotion_before         text,
  emotion_after          text,
  exit_reason            text,
  lesson                 text,
  notes                  text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint trades_id_user unique (id, user_id),
  constraint trades_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade,
  constraint trades_plan_fk foreign key (plan_id, user_id)
    references public.trade_plans (id, user_id) on delete set null,
  constraint trades_spec_fk foreign key (spec_id, user_id)
    references public.trading_instrument_specs (id, user_id) on delete set null,

  -- Остаток не может уйти в минус: это означало бы, что закрыли больше, чем
  -- открывали. Проверка в RPC делается под блокировкой, а это страховка.
  constraint trades_remaining_sane check (remaining_quantity >= 0 and remaining_quantity <= quantity),
  constraint trades_closed_consistent check (
    (status = 'closed' and closed_at is not null and remaining_quantity = 0)
    or (status <> 'closed')
  ),
  constraint trades_close_after_open check (closed_at is null or closed_at >= opened_at),
  -- Стоп, равный входу, не задаёт риск; сторона стопа проверяется здесь же.
  constraint trades_stop_side check (
    initial_stop is null
    or (direction = 'long'  and initial_stop < entry_price)
    or (direction = 'short' and initial_stop > entry_price)
  )
);

comment on table public.trades is
  'Факт сделки со снимком условий входа. Исходный стоп и начальный риск неизменяемы.';

create index if not exists idx_trades_account_date
  on public.trades (account_id, local_date desc, opened_at desc);
create index if not exists idx_trades_account_status
  on public.trades (account_id, status) where status = 'open';
create index if not exists idx_trades_instrument
  on public.trades (account_id, instrument_id, opened_at desc);
create index if not exists idx_trades_closed
  on public.trades (account_id, closed_at desc) where closed_at is not null;

create trigger trg_trades_updated before update on public.trades
  for each row execute function public.set_updated_at();

alter table public.trades enable row level security;

create policy trades_select_own on public.trades
  for select using (auth.uid() = user_id);
create policy trades_insert_own on public.trades
  for insert with check (auth.uid() = user_id);
create policy trades_update_own on public.trades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trades_delete_own on public.trades
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trades to authenticated;
grant all on public.trades to service_role;

-- ---------------------------------------------------------------------------
-- Выходы
-- ---------------------------------------------------------------------------
create table if not exists public.trade_exits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trade_id       uuid not null,
  quantity       numeric(20,8) not null check (quantity > 0),
  price          numeric(20,8) not null check (price > 0),
  exited_at      timestamptz not null,
  reason         text,
  fx_rate        numeric(24,12) check (fx_rate is null or fx_rate > 0),
  fx_estimated   boolean not null default false,
  -- Ключ действия: повторная доставка того же нажатия в боте или повтор
  -- запроса не должны создавать второй выход и вторую денежную проводку.
  action_key     text not null,
  created_at     timestamptz not null default now(),

  constraint trade_exits_id_user unique (id, user_id),
  constraint trade_exits_trade_fk foreign key (trade_id, user_id)
    references public.trades (id, user_id) on delete cascade,
  constraint trade_exits_action_unique unique (user_id, action_key)
);

comment on table public.trade_exits is
  'Частичные и финальный выходы. action_key делает повтор запроса безопасным.';

create index if not exists idx_trade_exits_trade
  on public.trade_exits (trade_id, exited_at);

alter table public.trade_exits enable row level security;

create policy trade_exits_select_own on public.trade_exits
  for select using (auth.uid() = user_id);
create policy trade_exits_insert_own on public.trade_exits
  for insert with check (auth.uid() = user_id);
create policy trade_exits_update_own on public.trade_exits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trade_exits_delete_own on public.trade_exits
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trade_exits to authenticated;
grant all on public.trade_exits to service_role;

-- ---------------------------------------------------------------------------
-- События сделки: переносы стопа, подтверждения, заметки, исправления
-- ---------------------------------------------------------------------------
create table if not exists public.trade_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trade_id    uuid not null,
  kind        text not null check (kind in
                ('stop_moved','note','confirmation','correction','attachment','void')),
  occurred_at timestamptz not null default now(),
  -- Для переноса стопа: откуда и куда.
  from_value  numeric(20,8),
  to_value    numeric(20,8),
  reason      text,
  payload     jsonb not null default '{}'::jsonb,
  -- Кто внёс: сам владелец через сайт или через бота.
  author      text not null default 'web' check (author in ('web','telegram','system')),
  created_at  timestamptz not null default now(),

  constraint trade_events_id_user unique (id, user_id),
  constraint trade_events_trade_fk foreign key (trade_id, user_id)
    references public.trades (id, user_id) on delete cascade
);

comment on table public.trade_events is
  'Хронология сделки. Перенос стопа фиксируется здесь и не меняет исходный риск.';

-- Для одинаковых времён нужна стабильная последовательность, поэтому в
-- сортировку всегда входит id.
create index if not exists idx_trade_events_trade
  on public.trade_events (trade_id, occurred_at, id);

alter table public.trade_events enable row level security;

create policy trade_events_select_own on public.trade_events
  for select using (auth.uid() = user_id);
create policy trade_events_insert_own on public.trade_events
  for insert with check (auth.uid() = user_id);
create policy trade_events_update_own on public.trade_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trade_events_delete_own on public.trade_events
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trade_events to authenticated;
grant all on public.trade_events to service_role;

-- ---------------------------------------------------------------------------
-- Денежные корректировки по сделке: комиссия, своп, funding
--
-- Суммы ПОДПИСАННЫЕ: комиссия отрицательна, своп любого знака. Складываются
-- как есть — вычитать отдельно нельзя, получится двойное списание.
-- ---------------------------------------------------------------------------
create table if not exists public.trade_cash_adjustments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  trade_id        uuid not null,
  kind            text not null check (kind in ('commission','swap','funding','other')),
  amount_source   numeric(20,8) not null,
  source_currency text not null,
  fx_rate         numeric(24,12) check (fx_rate is null or fx_rate > 0),
  -- Сумма в валюте счёта. null — курс неизвестен, метрика остаётся неизвестной.
  amount_account  numeric(20,8),
  posted_at       timestamptz not null,
  note            text,
  action_key      text not null,
  created_at      timestamptz not null default now(),

  constraint tca_id_user unique (id, user_id),
  constraint tca_trade_fk foreign key (trade_id, user_id)
    references public.trades (id, user_id) on delete cascade,
  constraint tca_action_unique unique (user_id, action_key),
  constraint tca_amount_nonzero check (amount_source <> 0)
);

comment on table public.trade_cash_adjustments is
  'Комиссии, свопы и funding по сделке. Суммы подписанные, время — фактической проводки.';

create index if not exists idx_tca_trade on public.trade_cash_adjustments (trade_id, posted_at);

alter table public.trade_cash_adjustments enable row level security;

create policy tca_select_own on public.trade_cash_adjustments
  for select using (auth.uid() = user_id);
create policy tca_insert_own on public.trade_cash_adjustments
  for insert with check (auth.uid() = user_id);
create policy tca_update_own on public.trade_cash_adjustments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tca_delete_own on public.trade_cash_adjustments
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trade_cash_adjustments to authenticated;
grant all on public.trade_cash_adjustments to service_role;

-- ---------------------------------------------------------------------------
-- Внешние потоки: пополнения и выводы
--
-- Пополнение НЕ является прибылью. Оно меняет учётный баланс и не трогает
-- накопленный торговый результат.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_cash_flows (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid not null,
  kind            text not null check (kind in ('deposit','withdrawal')),
  amount          numeric(20,8) not null check (amount > 0),
  occurred_at     timestamptz not null,
  note            text,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),

  constraint tcf_id_user unique (id, user_id),
  constraint tcf_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade,
  constraint tcf_idempotency_unique unique (user_id, idempotency_key)
);

comment on table public.trading_cash_flows is
  'Пополнения и выводы. Повтор запроса с тем же ключом не создаёт вторую проводку.';

create index if not exists idx_tcf_account on public.trading_cash_flows (account_id, occurred_at desc);

alter table public.trading_cash_flows enable row level security;

create policy tcf_select_own on public.trading_cash_flows
  for select using (auth.uid() = user_id);
create policy tcf_insert_own on public.trading_cash_flows
  for insert with check (auth.uid() = user_id);
create policy tcf_update_own on public.trading_cash_flows
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tcf_delete_own on public.trading_cash_flows
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_cash_flows to authenticated;
grant all on public.trading_cash_flows to service_role;

-- ---------------------------------------------------------------------------
-- Сверка с брокером
--
-- Отдельная операция с обязательной причиной. Прятать расхождение внутри P/L
-- нельзя: тогда торговый результат перестанет быть торговым.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_reconciliations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  account_id     uuid not null,
  broker_balance numeric(20,8) not null,
  book_balance   numeric(20,8) not null,
  -- Подписанная поправка: сколько добавлено к учётному балансу.
  adjustment     numeric(20,8) not null,
  reason         text not null,
  reconciled_at  timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint trec_id_user unique (id, user_id),
  constraint trec_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade,
  constraint trec_reason_present check (char_length(btrim(reason)) > 0)
);

comment on table public.trading_reconciliations is
  'Ручная сверка с брокером: расхождение фиксируется явно, а не растворяется в P/L.';

create index if not exists idx_trec_account
  on public.trading_reconciliations (account_id, reconciled_at desc);

alter table public.trading_reconciliations enable row level security;

create policy trec_select_own on public.trading_reconciliations
  for select using (auth.uid() = user_id);
create policy trec_insert_own on public.trading_reconciliations
  for insert with check (auth.uid() = user_id);
create policy trec_update_own on public.trading_reconciliations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trec_delete_own on public.trading_reconciliations
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_reconciliations to authenticated;
grant all on public.trading_reconciliations to service_role;
