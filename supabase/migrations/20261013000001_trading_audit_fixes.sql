-- Исправления по итогам аудита модуля «Торговля».
--
-- 1. Выходы, расходы и оценки правил нельзя было отобрать по счёту: у них есть
--    только trade_id. Аналитика брала их общим запросом с ограничением по
--    числу строк и фильтровала уже в памяти — при нескольких счетах часть
--    проводок нужного счёта могла не попасть в выборку, и результат за период
--    оказался бы занижен МОЛЧА. Добавляем account_id в представления.
--
-- 2. Справочник инструментов читался без авторизации: политика разрешала
--    строки с user_id is null кому угодно. Данные там не личные, но читать их
--    анонимно незачем.

-- ---------------------------------------------------------------------------
-- Выходы со ссылкой на счёт
-- ---------------------------------------------------------------------------
drop view if exists public.trade_exits_v;

create view public.trade_exits_v
with (security_invoker = true) as
select
  e.id,
  e.user_id,
  e.trade_id,
  t.account_id,
  e.exited_at,
  e.reason,
  e.fx_estimated,
  e.action_key,
  e.quantity::text as quantity,
  e.price::text    as price,
  e.fx_rate::text  as fx_rate
from public.trade_exits e
join public.trades t on t.id = e.trade_id;

comment on view public.trade_exits_v is
  'Выходы со счётом сделки: без него аналитика не могла отобрать нужные строки до применения лимита.';

grant select on public.trade_exits_v to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Денежные корректировки со ссылкой на счёт
-- ---------------------------------------------------------------------------
create or replace view public.trade_cash_adjustments_v
with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.trade_id,
  t.account_id,
  a.kind,
  a.posted_at,
  a.note,
  a.source_currency,
  a.amount_source::text  as amount_source,
  a.amount_account::text as amount_account,
  a.fx_rate::text        as fx_rate
from public.trade_cash_adjustments a
join public.trades t on t.id = a.trade_id;

grant select on public.trade_cash_adjustments_v to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Оценки правил со ссылкой на счёт
-- ---------------------------------------------------------------------------
create or replace view public.trade_rule_evaluations_v
with (security_invoker = true) as
select
  e.id,
  e.user_id,
  e.trade_id,
  t.account_id,
  e.rule_code,
  e.rule_version,
  e.stage,
  e.status,
  e.unknown_reason,
  e.reconstructed,
  e.evaluated_at,
  e.weight::text as weight
from public.trade_rule_evaluations e
join public.trades t on t.id = e.trade_id;

grant select on public.trade_rule_evaluations_v to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Справочник инструментов: только для авторизованных
-- ---------------------------------------------------------------------------
drop policy if exists trading_instruments_select on public.trading_instruments;

create policy trading_instruments_select on public.trading_instruments
  for select using (
    auth.uid() is not null and (user_id is null or auth.uid() = user_id)
  );
