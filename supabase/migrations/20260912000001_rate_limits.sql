-- Ограничение частоты запросов (rate limiting).
--
-- Serverless-функции не хранят состояние между вызовами: счётчик в памяти процесса
-- не работает, потому что соседний запрос попадёт в другой экземпляр. Поэтому счётчик
-- живёт в БД. Отдельный сервис (Redis/Upstash) не заводим — Postgres уже есть.

create table if not exists public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  count         integer     not null default 0
);

comment on table public.rate_limits is
  'Счётчики частоты запросов. Пишет только service_role из серверного кода.';

-- Данные служебные и не принадлежат пользователям: доступ только у service_role,
-- который RLS обходит. anon/authenticated не получают никаких прав.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Атомарное потребление лимита: одна инструкция, без гонок между параллельными запросами.
-- Возвращает, разрешён ли запрос, сколько осталось и когда окно сбросится.
create or replace function public.consume_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now    timestamptz := now();
  v_start  timestamptz;
  v_count  integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set
      -- Окно истекло — начинаем новое, иначе увеличиваем счётчик.
      window_start = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds)
        then v_now else rl.window_start end,
      count = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds)
        then 1 else rl.count + 1 end
  returning rl.window_start, rl.count into v_start, v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Уборка старых записей, чтобы таблица не росла бесконечно.
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);
