-- Учёт личных доходов и расходов.
--
-- Суммы храним в МИНОРНЫХ единицах (тыйын) целым числом: числа с плавающей
-- точкой для денег дают ошибки округления при суммировании.
--
-- financial_day — не дата операции, а «финансовый день», к которому она отнесена:
-- сутки учёта начинаются в 01:00 по местному времени, поэтому покупка в 00:30
-- принадлежит предыдущему дню. Считается в приложении и хранится явно, чтобы
-- отчёты не пересчитывали границы на каждый запрос.

create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('expense', 'income', 'refund')),
  amount_minor  bigint not null check (amount_minor > 0),
  currency      text not null default 'KGS',
  -- Категория обязательна только для расходов; у доходов и возвратов её нет.
  category      text check (category in (
                  'food','transport','shopping','fun','connectivity','education',
                  'home','tech','finance','gifts','health','other')),
  description   text not null default '',
  occurred_at   timestamptz not null default now(),
  financial_day date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint transactions_expense_has_category
    check (kind <> 'expense' or category is not null)
);

comment on table public.transactions is
  'Реестр личных операций. Суммы в минорных единицах; financial_day — день учёта (граница 01:00).';

create index if not exists idx_transactions_user_day
  on public.transactions (user_id, financial_day desc);
create index if not exists idx_transactions_user_occurred
  on public.transactions (user_id, occurred_at desc);

create trigger trg_transactions_updated before update on public.transactions
  for each row execute function public.set_updated_at();

-- Изоляция: каждый видит и меняет только свои операции.
alter table public.transactions enable row level security;

create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);
create policy transactions_insert_own on public.transactions
  for insert with check (auth.uid() = user_id);
create policy transactions_update_own on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_delete_own on public.transactions
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;

-- Настройки учёта: начальный баланс и бюджеты. Всё необязательное —
-- если пользователь не задал баланс, он не придумывается.
alter table public.user_settings
  add column if not exists opening_balance_minor bigint,
  add column if not exists daily_budget_minor    bigint,
  add column if not exists monthly_budget_minor  bigint,
  add column if not exists main_currency         text not null default 'KGS';
