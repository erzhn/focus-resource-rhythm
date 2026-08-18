-- ============================================================================
-- Табличные привилегии для ролей Supabase API (anon, authenticated, service_role).
-- Создание таблицы в PostgreSQL не даёт доступа этим ролям автоматически, если в
-- проекте не настроены default-привилегии. RLS уже включён на всех таблицах и
-- ограничивает строки (auth.uid() = user_id), поэтому выдача табличного GRANT
-- безопасна: без подходящей политики anon/authenticated не получают ни строки.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- Будущие объекты в public тоже получают доступ.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
