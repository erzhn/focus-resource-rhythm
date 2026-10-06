-- Модуль «Торговля», часть 5: представления и атомарная запись выхода.
--
-- Почему суммы отдаются ТЕКСТОМ.
--
-- PostgREST присылает numeric в JSON полным числом, но JSON.parse превращает
-- его в double. Проверено на этой базе: 10000000000.12345678 возвращается как
-- 10000000000.123457 — восемь знаков теряются ещё до попадания в код. Поэтому
-- каждое денежное поле приводится к text, а арифметика остаётся на сервере в
-- десятичном виде.
--
-- Представления создаются с security_invoker: RLS владельца продолжает
-- действовать и через них. PostgreSQL 17.6 это поддерживает.

-- ---------------------------------------------------------------------------
-- Сделки с подписями инструмента и безопасными суммами
-- ---------------------------------------------------------------------------
create or replace view public.trading_trades_v
with (security_invoker = true) as
select
  t.id,
  t.user_id,
  t.account_id,
  t.instrument_id,
  t.plan_id,
  t.status,
  t.direction,
  t.entry_mode,
  t.source,
  t.opened_at,
  t.closed_at,
  t.recorded_at,
  t.local_date,
  t.setup_id,
  t.emotion_before,
  t.emotion_after,
  t.exit_reason,
  t.lesson,
  t.notes,
  t.unknown_reason,
  t.spec_version,
  t.spec_calc_model,
  t.spec_volume_unit,
  t.spec_quote_currency,
  t.account_timezone,
  t.excursion_source,
  t.excursion_estimated,
  t.fx_at_entry_estimated,
  t.balance_at_entry_source,

  i.code          as instrument_code,
  i.display_name  as instrument_name,
  i.market_code,
  i.product_type,
  m.title         as market_title,
  a.currency      as account_currency,
  a.title         as account_title,
  a.is_demo,

  -- Денежные и ценовые поля — текстом, чтобы не потерять знаки по дороге.
  t.entry_price::text               as entry_price,
  t.quantity::text                  as quantity,
  t.remaining_quantity::text        as remaining_quantity,
  t.initial_stop::text              as initial_stop,
  t.current_stop::text              as current_stop,
  t.target::text                    as target,
  t.spec_contract_multiplier::text  as spec_contract_multiplier,
  t.spec_volume_step::text          as spec_volume_step,
  t.spec_min_close_volume::text     as spec_min_close_volume,
  t.spec_min_remaining_volume::text as spec_min_remaining_volume,
  t.fx_at_entry::text               as fx_at_entry,
  t.balance_at_entry::text          as balance_at_entry,
  t.initial_distance::text          as initial_distance,
  t.initial_risk_quote::text        as initial_risk_quote,
  t.initial_risk_account::text      as initial_risk_account,
  t.risk_pct::text                  as risk_pct,
  t.planned_rr::text                as planned_rr,
  t.gross_realized_account::text    as gross_realized_account,
  t.adjustments_account::text       as adjustments_account,
  t.net_realized_account::text      as net_realized_account,
  t.final_r::text                   as final_r,
  t.avg_exit_price::text            as avg_exit_price,
  t.mfe_price::text                 as mfe_price,
  t.mae_price::text                 as mae_price
from public.trades t
join public.trading_instruments i on i.id = t.instrument_id
join public.trading_markets m on m.code = i.market_code
join public.trading_accounts a on a.id = t.account_id;

comment on view public.trading_trades_v is
  'Сделки с подписями инструмента. Суммы текстом: JSON.parse теряет точность numeric.';

grant select on public.trading_trades_v to authenticated;
grant select on public.trading_trades_v to service_role;

-- ---------------------------------------------------------------------------
-- Выходы
-- ---------------------------------------------------------------------------
create or replace view public.trade_exits_v
with (security_invoker = true) as
select
  e.id,
  e.user_id,
  e.trade_id,
  e.exited_at,
  e.reason,
  e.fx_estimated,
  e.action_key,
  e.quantity::text as quantity,
  e.price::text    as price,
  e.fx_rate::text  as fx_rate
from public.trade_exits e;

grant select on public.trade_exits_v to authenticated;
grant select on public.trade_exits_v to service_role;

-- ---------------------------------------------------------------------------
-- Счета: учётный баланс как АГРЕГАТ сохранённых значений
--
-- Здесь SQL только складывает то, что уже посчитано ядром расчётов, и ничего
-- не выводит заново. Пополнение увеличивает баланс и НЕ попадает в
-- накопленный торговый результат — это два разных числа.
-- ---------------------------------------------------------------------------
create or replace view public.trading_accounts_v
with (security_invoker = true) as
with flows as (
  select
    account_id,
    sum(case when kind = 'deposit' then amount else -amount end) as net_flow
  from public.trading_cash_flows
  group by account_id
),
realized as (
  select
    account_id,
    sum(coalesce(net_realized_account, 0)) as trading_pnl,
    count(*) filter (where status = 'open') as open_trades,
    count(*) filter (where status = 'closed') as closed_trades,
    -- Сколько сделок остались с неизвестным результатом: показывается рядом
    -- со статистикой, а не прячется.
    count(*) filter (where status = 'closed' and net_realized_account is null) as unknown_result_trades
  from public.trades
  where status <> 'voided'
  group by account_id
),
adjustments as (
  select account_id, sum(adjustment) as total
  from public.trading_reconciliations
  group by account_id
)
select
  a.id,
  a.user_id,
  a.title,
  a.broker,
  a.currency,
  a.opening_date,
  a.timezone,
  a.is_demo,
  a.archived_at,
  a.created_at,
  coalesce(r.open_trades, 0)            as open_trades,
  coalesce(r.closed_trades, 0)          as closed_trades,
  coalesce(r.unknown_result_trades, 0)  as unknown_result_trades,
  a.opening_balance::text               as opening_balance,
  coalesce(f.net_flow, 0)::text         as net_cash_flow,
  coalesce(r.trading_pnl, 0)::text      as cumulative_trading_pnl,
  coalesce(adj.total, 0)::text          as reconciliation_total,
  (a.opening_balance
    + coalesce(f.net_flow, 0)
    + coalesce(r.trading_pnl, 0)
    + coalesce(adj.total, 0))::text     as book_balance
from public.trading_accounts a
left join flows f on f.account_id = a.id
left join realized r on r.account_id = a.id
left join adjustments adj on adj.account_id = a.id;

comment on view public.trading_accounts_v is
  'Счета с учётным балансом. Это капитал журнала, а не свободные средства у брокера.';

grant select on public.trading_accounts_v to authenticated;
grant select on public.trading_accounts_v to service_role;

-- ---------------------------------------------------------------------------
-- Спецификации с текстовыми числами
-- ---------------------------------------------------------------------------
create or replace view public.trading_instrument_specs_v
with (security_invoker = true) as
select
  s.id,
  s.user_id,
  s.account_id,
  s.instrument_id,
  s.version,
  s.calc_model,
  s.volume_unit,
  s.quote_currency,
  s.is_configured,
  i.code         as instrument_code,
  i.display_name as instrument_name,
  i.market_code,
  s.contract_multiplier::text  as contract_multiplier,
  s.min_volume::text           as min_volume,
  s.volume_step::text          as volume_step,
  s.max_volume::text           as max_volume,
  s.min_close_volume::text     as min_close_volume,
  s.min_remaining_volume::text as min_remaining_volume,
  s.price_step::text           as price_step,
  s.pip_size::text             as pip_size
from public.trading_instrument_specs s
join public.trading_instruments i on i.id = s.instrument_id;

grant select on public.trading_instrument_specs_v to authenticated;
grant select on public.trading_instrument_specs_v to service_role;

-- ---------------------------------------------------------------------------
-- Атомарная запись выхода
--
-- Два одновременных запроса не должны закрыть один остаток дважды. Поэтому
-- строка сделки берётся под блокировку, и перед записью проверяется, что
-- остаток всё ещё тот, из которого исходил расчёт на сервере.
--
-- ВАЖНО: функция НЕ считает деньги. Валовой и чистый результат, средний выход
-- и итоговый R приходят уже посчитанными ядром расчётов (src/domain/trading) —
-- вторая реализация формул в SQL со временем разошлась бы с первой.
--
-- Проверка владельца: функция выполняется с правами вызывающего, поэтому для
-- обычного клиента её защищает RLS. Service-role обходит RLS, и серверный
-- обработчик бота обязан проверить владельца сам.
-- ---------------------------------------------------------------------------
create or replace function public.record_trade_exit(
  p_trade_id                uuid,
  p_quantity                numeric,
  p_price                   numeric,
  p_exited_at               timestamptz,
  p_action_key              text,
  p_expected_remaining      numeric,
  p_new_remaining           numeric,
  p_gross_realized_account  numeric,
  p_net_realized_account    numeric,
  p_final_r                 numeric,
  p_avg_exit_price          numeric,
  p_unknown_reason          text default null,
  p_reason                  text default null,
  p_fx_rate                 numeric default null,
  p_fx_estimated            boolean default false
)
returns table (exit_id uuid, remaining numeric, closed boolean)
language plpgsql
as $$
declare
  v_trade   public.trades%rowtype;
  v_exit_id uuid;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;

  if not found then
    raise exception 'Сделка не найдена' using errcode = 'no_data_found';
  end if;

  if v_trade.status = 'voided' then
    raise exception 'Сделка аннулирована — записывать выходы нельзя' using errcode = 'check_violation';
  end if;

  -- Остаток изменился между расчётом и записью: другой выход успел пройти.
  -- Отказываем, чтобы не записать результат, посчитанный из устаревшего состояния.
  if v_trade.remaining_quantity <> p_expected_remaining then
    raise exception 'Остаток изменился: ожидалось %, в базе %',
      p_expected_remaining, v_trade.remaining_quantity
      using errcode = 'serialization_failure';
  end if;

  if p_quantity > v_trade.remaining_quantity then
    raise exception 'Нельзя закрыть больше остатка' using errcode = 'check_violation';
  end if;

  if p_exited_at < v_trade.opened_at then
    raise exception 'Выход не может предшествовать входу' using errcode = 'check_violation';
  end if;

  insert into public.trade_exits
    (user_id, trade_id, quantity, price, exited_at, reason, fx_rate, fx_estimated, action_key)
  values
    (v_trade.user_id, p_trade_id, p_quantity, p_price, p_exited_at, p_reason, p_fx_rate, p_fx_estimated, p_action_key)
  returning id into v_exit_id;

  update public.trades
     set remaining_quantity     = p_new_remaining,
         gross_realized_account = p_gross_realized_account,
         net_realized_account   = p_net_realized_account,
         final_r                = p_final_r,
         avg_exit_price         = p_avg_exit_price,
         unknown_reason         = p_unknown_reason,
         status                 = case when p_new_remaining = 0 then 'closed' else status end,
         closed_at              = case when p_new_remaining = 0 then p_exited_at else closed_at end
   where id = p_trade_id;

  return query select v_exit_id, p_new_remaining, p_new_remaining = 0;
end;
$$;

revoke all on function public.record_trade_exit from public, anon;
grant execute on function public.record_trade_exit to authenticated, service_role;

comment on function public.record_trade_exit is
  'Атомарная запись выхода под блокировкой сделки. Деньги считает ядро расчётов, функция только проверяет и сохраняет.';
