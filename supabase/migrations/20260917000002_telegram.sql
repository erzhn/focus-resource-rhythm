-- Привязка Telegram-чата к пользователю.
--
-- Бот не может сам узнать, кому принадлежит чат: Telegram сообщает только
-- chat_id. Поэтому пользователь берёт одноразовый код в настройках приложения
-- и отправляет боту «/start КОД» — так чат связывается с аккаунтом.

create table if not exists public.telegram_links (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  -- chat_id уникален: один чат не может обслуживать двух пользователей.
  chat_id         bigint unique,
  link_code       text unique,
  -- Код живёт недолго: если им не воспользовались, он не должен работать вечно.
  code_expires_at timestamptz,
  linked_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.telegram_links is
  'Связь Telegram-чата с аккаунтом. Код одноразовый и с ограниченным сроком.';

create index if not exists idx_telegram_links_code on public.telegram_links (link_code);

create trigger trg_telegram_links_updated before update on public.telegram_links
  for each row execute function public.set_updated_at();

alter table public.telegram_links enable row level security;

-- Пользователь видит и меняет только свою привязку. Вебхук работает через
-- service_role: он обслуживает запрос от Telegram, а не от браузера.
create policy telegram_links_select_own on public.telegram_links
  for select using (auth.uid() = user_id);
create policy telegram_links_insert_own on public.telegram_links
  for insert with check (auth.uid() = user_id);
create policy telegram_links_update_own on public.telegram_links
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy telegram_links_delete_own on public.telegram_links
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.telegram_links to authenticated;
grant all on public.telegram_links to service_role;
