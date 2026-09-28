-- Регулярные расходы и связь трат со сферами жизни.
--
-- 1. recurring_expenses — аренда, подписки, интернет: суммы известны заранее,
--    поэтому «сколько свободно» можно считать честно, с учётом того, что ещё
--    предстоит заплатить в этом месяце. Дата хранится как день месяца, а не
--    как календарная дата: правило «пятого числа» не зависит от месяца.
--
-- 2. category_life_areas — какая категория трат к какой сфере жизни относится.
--    Сопоставление задаётся один раз в настройках, а не выбирается при каждой
--    записи: быстрый ввод не должен замедляться. Категории без сопоставления
--    просто не попадают в разрез по сферам — сфера за пользователя не
--    придумывается.

create table if not exists public.recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  amount_minor  bigint not null check (amount_minor > 0),
  currency      text not null default 'KGS',
  category      text not null check (category in (
                  'food','transport','shopping','fun','connectivity','education',
                  'home','tech','finance','gifts','health','other')),
  -- 1–31; если в месяце меньше дней, списание переносится на последний.
  day_of_month  smallint not null check (day_of_month between 1 and 31),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.recurring_expenses is
  'Регулярные обязательные платежи. Суммы в минорных единицах, дата — день месяца.';

create index if not exists idx_recurring_user
  on public.recurring_expenses (user_id, day_of_month);

create trigger trg_recurring_updated before update on public.recurring_expenses
  for each row execute function public.set_updated_at();

alter table public.recurring_expenses enable row level security;

create policy recurring_select_own on public.recurring_expenses
  for select using (auth.uid() = user_id);
create policy recurring_insert_own on public.recurring_expenses
  for insert with check (auth.uid() = user_id);
create policy recurring_update_own on public.recurring_expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy recurring_delete_own on public.recurring_expenses
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.recurring_expenses to authenticated;
grant all on public.recurring_expenses to service_role;

-- ---------------------------------------------------------------------------

create table if not exists public.category_life_areas (
  user_id       uuid not null references auth.users(id) on delete cascade,
  category      text not null check (category in (
                  'food','transport','shopping','fun','connectivity','education',
                  'home','tech','finance','gifts','health','other')),
  life_area_id  uuid not null references public.life_areas(id) on delete cascade,
  updated_at    timestamptz not null default now(),
  primary key (user_id, category)
);

comment on table public.category_life_areas is
  'Категория трат → сфера жизни. Задаётся один раз, чтобы быстрый ввод оставался быстрым.';

create trigger trg_category_life_areas_updated before update on public.category_life_areas
  for each row execute function public.set_updated_at();

alter table public.category_life_areas enable row level security;

create policy cla_select_own on public.category_life_areas
  for select using (auth.uid() = user_id);
create policy cla_insert_own on public.category_life_areas
  for insert with check (auth.uid() = user_id);
create policy cla_update_own on public.category_life_areas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cla_delete_own on public.category_life_areas
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.category_life_areas to authenticated;
grant all on public.category_life_areas to service_role;
