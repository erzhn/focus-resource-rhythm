-- Модуль «Торговля», часть 1: счета, справочник инструментов, спецификации, курсы.
--
-- Отличия от учёта личных финансов в этом же проекте — осознанные:
--
--   • суммы здесь numeric, а не целые минорные единицы: рынки разные,
--     множители и дробные объёмы тоже;
--   • день считается по сохранённой IANA-зоне счёта, а не по фиксированному
--     смещению: счёт может быть где угодно, и границы «не больше трёх входов
--     в день» обязаны совпадать с календарём владельца.
--
-- Личные финансы (transactions, recurring_expenses) этот модуль не трогает и
-- ни в каких итогах с ними не смешивается.

-- ---------------------------------------------------------------------------
-- Счета
-- ---------------------------------------------------------------------------
create table if not exists public.trading_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  broker           text,
  currency         text not null default 'USD',
  -- Фиксируется один раз на дату начала учёта. Последующее пополнение —
  -- не прибыль и сюда не попадает.
  opening_balance  numeric(20,8) not null default 0,
  opening_date     date not null,
  -- IANA-зона: 'Asia/Bishkek', 'Europe/Berlin'. Постоянное смещение не годится.
  timezone         text not null default 'Asia/Bishkek',
  -- Демосчёт: синтетические данные для знакомства с модулем. Отделён от
  -- боевого счёта и не попадает в его аналитику.
  is_demo          boolean not null default false,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Ключ для составных внешних ключей: дочерняя запись не может ссылаться на
  -- счёт другого владельца. Одного user_id в дочерней таблице мало — он не
  -- доказывает, что счёт принадлежит тому же человеку.
  constraint trading_accounts_id_user unique (id, user_id),
  constraint trading_accounts_currency_len check (char_length(currency) between 2 and 10)
);

comment on table public.trading_accounts is
  'Личный торговый счёт. opening_balance фиксируется один раз; пополнения ведутся отдельно.';

create index if not exists idx_trading_accounts_user
  on public.trading_accounts (user_id, archived_at nulls first, created_at desc);

create trigger trg_trading_accounts_updated before update on public.trading_accounts
  for each row execute function public.set_updated_at();

alter table public.trading_accounts enable row level security;

create policy trading_accounts_select_own on public.trading_accounts
  for select using (auth.uid() = user_id);
create policy trading_accounts_insert_own on public.trading_accounts
  for insert with check (auth.uid() = user_id);
create policy trading_accounts_update_own on public.trading_accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trading_accounts_delete_own on public.trading_accounts
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_accounts to authenticated;
grant all on public.trading_accounts to service_role;

-- ---------------------------------------------------------------------------
-- Рынки: общий справочник, одинаковый для всех
-- ---------------------------------------------------------------------------
create table if not exists public.trading_markets (
  code       text primary key,
  title      text not null,
  sort_order integer not null default 0
);

comment on table public.trading_markets is
  'Рынки для первого списка связки «Рынок → Инструмент». Общий справочник только для чтения.';

insert into public.trading_markets (code, title, sort_order) values
  ('forex',      'Forex',                    10),
  ('metals',     'Металлы',                  20),
  ('crypto',     'Криптовалюты',             30),
  ('equity',     'Акции и ETF',              40),
  ('index',      'Индексы',                  50),
  ('commodity',  'Энергоносители и сырьё',   60),
  ('other',      'Другой рынок',             99)
on conflict (code) do nothing;

alter table public.trading_markets enable row level security;

create policy trading_markets_read_all on public.trading_markets
  for select using (auth.uid() is not null);

grant select on public.trading_markets to authenticated;
grant all on public.trading_markets to service_role;

-- ---------------------------------------------------------------------------
-- Инструменты
--
-- user_id = null означает запись общего стартового справочника: она помогает
-- найти инструмент по названию, но НЕ утверждает, что он доступен у брокера
-- владельца и уж тем более не задаёт размер контракта. Множители и объёмная
-- сетка живут в спецификации на конкретном счёте.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_instruments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  market_code     text not null references public.trading_markets(code),
  -- Код для человека: XAUUSD, AAPL. Брокерский символ и алиасы не заменяют
  -- уникальную идентичность инструмента.
  code            text not null,
  display_name    text not null,
  broker_symbol   text,
  venue           text,
  base_asset      text,
  quote_currency  text not null,
  product_type    text not null check (product_type in
                    ('spot','equity','cfd','linear_future','linear_perpetual','unknown')),
  -- Для поиска: «золото», 'gold', 'XAUUSD'.
  aliases         text[] not null default '{}',
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint trading_instruments_id_user unique (id, user_id)
);

comment on table public.trading_instruments is
  'Справочник инструментов. user_id null — общая запись для поиска, не утверждение о доступности у брокера.';

create unique index if not exists uq_trading_instruments_shared_code
  on public.trading_instruments (market_code, code) where user_id is null;
create unique index if not exists uq_trading_instruments_user_code
  on public.trading_instruments (user_id, market_code, code) where user_id is not null;
create index if not exists idx_trading_instruments_lookup
  on public.trading_instruments (market_code, code);

create trigger trg_trading_instruments_updated before update on public.trading_instruments
  for each row execute function public.set_updated_at();

alter table public.trading_instruments enable row level security;

-- Общие записи видны всем авторизованным; свои — только владельцу.
create policy trading_instruments_select on public.trading_instruments
  for select using (user_id is null or auth.uid() = user_id);
create policy trading_instruments_insert_own on public.trading_instruments
  for insert with check (auth.uid() = user_id);
create policy trading_instruments_update_own on public.trading_instruments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trading_instruments_delete_own on public.trading_instruments
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_instruments to authenticated;
grant all on public.trading_instruments to service_role;

-- Стартовый справочник: только идентичность и валюта котировки.
-- Размеры контрактов намеренно НЕ заполняются: у каждого брокера свои, и
-- правдоподобное вымышленное число опаснее честного «нужно настроить».
insert into public.trading_instruments
  (user_id, market_code, code, display_name, quote_currency, product_type, base_asset, aliases)
values
  (null, 'forex',     'EURUSD', 'EUR/USD',      'USD', 'spot',   'EUR', array['евро','eur']),
  (null, 'forex',     'GBPUSD', 'GBP/USD',      'USD', 'spot',   'GBP', array['фунт','gbp']),
  (null, 'forex',     'USDJPY', 'USD/JPY',      'JPY', 'spot',   'USD', array['иена','jpy']),
  (null, 'forex',     'USDCHF', 'USD/CHF',      'CHF', 'spot',   'USD', array['франк','chf']),
  (null, 'forex',     'AUDUSD', 'AUD/USD',      'USD', 'spot',   'AUD', array['осси','aud']),
  (null, 'forex',     'USDCAD', 'USD/CAD',      'CAD', 'spot',   'USD', array['канадец','cad']),
  (null, 'metals',    'XAUUSD', 'XAU/USD',      'USD', 'cfd',    'XAU', array['золото','gold']),
  (null, 'metals',    'XAGUSD', 'XAG/USD',      'USD', 'cfd',    'XAG', array['серебро','silver']),
  (null, 'crypto',    'BTCUSD', 'BTC/USD',      'USD', 'spot',   'BTC', array['биткоин','bitcoin']),
  (null, 'crypto',    'ETHUSD', 'ETH/USD',      'USD', 'spot',   'ETH', array['эфир','ethereum']),
  (null, 'crypto',    'BTCUSDT','BTC/USDT',     'USDT','spot',   'BTC', array['биткоин','bitcoin']),
  (null, 'crypto',    'ETHUSDT','ETH/USDT',     'USDT','spot',   'ETH', array['эфир','ethereum']),
  (null, 'crypto',    'SOLUSDT','SOL/USDT',     'USDT','spot',   'SOL', array['солана','solana']),
  (null, 'equity',    'AAPL',   'Apple',        'USD', 'equity', 'AAPL',array['эпл','apple']),
  (null, 'equity',    'MSFT',   'Microsoft',    'USD', 'equity', 'MSFT',array['майкрософт']),
  (null, 'equity',    'TSLA',   'Tesla',        'USD', 'equity', 'TSLA',array['тесла']),
  (null, 'equity',    'NVDA',   'NVIDIA',       'USD', 'equity', 'NVDA',array['нвидиа']),
  (null, 'equity',    'SPY',    'SPDR S&P 500', 'USD', 'equity', 'SPY', array['эс-энд-пи']),
  (null, 'equity',    'QQQ',    'Invesco QQQ',  'USD', 'equity', 'QQQ', array['насдак']),
  -- Для индексов и сырья тип продукта неизвестен до настройки: US500 и NAS100
  -- у разных брокеров означают разные контракты.
  (null, 'index',     'SP500',  'S&P 500',      'USD', 'unknown', null, array['сипи','us500','spx']),
  (null, 'index',     'NAS100', 'Nasdaq 100',   'USD', 'unknown', null, array['насдак','us100','ndx']),
  (null, 'index',     'DAX',    'DAX',          'EUR', 'unknown', null, array['дакс','ger40']),
  (null, 'commodity', 'WTI',    'WTI',          'USD', 'unknown', null, array['нефть','oil','usoil']),
  (null, 'commodity', 'BRENT',  'Brent',        'USD', 'unknown', null, array['нефть','brent','ukoil']),
  (null, 'commodity', 'NATGAS', 'Природный газ','USD', 'unknown', null, array['газ','gas']),
  (null, 'commodity', 'COPPER', 'Медь',         'USD', 'unknown', null, array['медь','copper'])
on conflict do nothing;

-- Избранное и недавно использованные — чтобы список не начинался с нуля
-- при каждом вводе.
create table if not exists public.trading_instrument_favourites (
  user_id       uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references public.trading_instruments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, instrument_id)
);

alter table public.trading_instrument_favourites enable row level security;

create policy tif_select_own on public.trading_instrument_favourites
  for select using (auth.uid() = user_id);
create policy tif_insert_own on public.trading_instrument_favourites
  for insert with check (auth.uid() = user_id);
create policy tif_delete_own on public.trading_instrument_favourites
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.trading_instrument_favourites to authenticated;
grant all on public.trading_instrument_favourites to service_role;

-- ---------------------------------------------------------------------------
-- Спецификации: связка счёт–инструмент, версионируемая
--
-- Версия попадает в снимок сделки. Смена минимального лота у брокера не должна
-- задним числом менять P/L и риск закрытых сделок, поэтому старые версии
-- остаются и не редактируются.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_instrument_specs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  account_id            uuid not null,
  instrument_id         uuid not null references public.trading_instruments(id) on delete restrict,
  version               integer not null default 1,

  -- 'linear' — поддержанная модель. 'unsupported' означает «считать нельзя»:
  -- опционы и инверсные контракты по линейной формуле дают правдоподобное,
  -- но неверное число.
  calc_model            text not null default 'unsupported'
                          check (calc_model in ('linear','unsupported')),
  volume_unit           text not null check (volume_unit in ('lot','share','coin','contract')),
  -- Множитель C: «изменение цены × объём» → сумма в валюте котировки.
  contract_multiplier   numeric(20,8),
  quote_currency        text not null,
  min_volume            numeric(20,8),
  volume_step           numeric(20,8),
  max_volume            numeric(20,8),
  min_close_volume      numeric(20,8),
  min_remaining_volume  numeric(20,8),
  price_step            numeric(20,8),
  -- Определение пункта для Forex; null — «не задано», а не ноль.
  pip_size              numeric(20,8),

  -- Спецификация настроена и годится для расчёта.
  is_configured         boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint tis_id_user unique (id, user_id),
  constraint tis_account_fk foreign key (account_id, user_id)
    references public.trading_accounts (id, user_id) on delete cascade,
  constraint tis_version_unique unique (account_id, instrument_id, version),

  -- Настроенная спецификация обязана иметь всё, без чего расчёт невозможен.
  constraint tis_configured_complete check (
    not is_configured or (
      calc_model = 'linear'
      and contract_multiplier is not null and contract_multiplier > 0
      and min_volume is not null and min_volume > 0
      and volume_step is not null and volume_step > 0
      and min_close_volume is not null and min_close_volume > 0
      and min_remaining_volume is not null and min_remaining_volume > 0
      and price_step is not null and price_step > 0
    )
  ),
  constraint tis_max_volume_sane check (max_volume is null or max_volume >= min_volume)
);

comment on table public.trading_instrument_specs is
  'Спецификация инструмента на счёте, версионируемая. Снимок версии хранится в сделке.';

create index if not exists idx_tis_account
  on public.trading_instrument_specs (account_id, instrument_id, version desc);

create trigger trg_tis_updated before update on public.trading_instrument_specs
  for each row execute function public.set_updated_at();

alter table public.trading_instrument_specs enable row level security;

create policy tis_select_own on public.trading_instrument_specs
  for select using (auth.uid() = user_id);
create policy tis_insert_own on public.trading_instrument_specs
  for insert with check (auth.uid() = user_id);
create policy tis_update_own on public.trading_instrument_specs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tis_delete_own on public.trading_instrument_specs
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_instrument_specs to authenticated;
grant all on public.trading_instrument_specs to service_role;

-- ---------------------------------------------------------------------------
-- Снимки курсов
--
-- Курс хранится как «единиц валюты счёта за одну единицу исходной валюты»,
-- со временем и источником. История не пересчитывается по сегодняшнему курсу:
-- риск при входе и каждый выход конвертируются по своему снимку.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_fx_snapshots (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  from_currency  text not null,
  to_currency    text not null,
  rate           numeric(24,12) not null check (rate > 0),
  observed_at    timestamptz not null,
  source         text not null default 'manual'
                   check (source in ('manual','imported','market_data')),
  -- Оценка, а не зафиксированный курс сделки: влияет на формулировки в UI.
  is_estimated   boolean not null default false,
  created_at     timestamptz not null default now(),

  constraint tfx_id_user unique (id, user_id),
  constraint tfx_currencies_differ check (from_currency <> to_currency)
);

comment on table public.trading_fx_snapshots is
  'Курс на момент события: «единиц валюты счёта за единицу исходной». USD и USDT — разные валюты.';

create index if not exists idx_tfx_lookup
  on public.trading_fx_snapshots (user_id, from_currency, to_currency, observed_at desc);

alter table public.trading_fx_snapshots enable row level security;

create policy tfx_select_own on public.trading_fx_snapshots
  for select using (auth.uid() = user_id);
create policy tfx_insert_own on public.trading_fx_snapshots
  for insert with check (auth.uid() = user_id);
create policy tfx_update_own on public.trading_fx_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tfx_delete_own on public.trading_fx_snapshots
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.trading_fx_snapshots to authenticated;
grant all on public.trading_fx_snapshots to service_role;
