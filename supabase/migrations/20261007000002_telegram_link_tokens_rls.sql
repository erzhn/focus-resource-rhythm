-- Владелец может выпустить и отозвать СВОЙ код привязки.
--
-- Раньше код выпускался записью открытой строки в telegram_links. Теперь в
-- базу попадает только хеш, а выпуск идёт из серверного действия от имени
-- пользователя — значит, нужна политика на вставку. Чужой код выпустить
-- нельзя: with check сверяет владельца.
--
-- Погашение кода делает вебхук под service-role: он обслуживает запрос от
-- Telegram, а не от браузера, и владельца определяет сам.

create policy tlt_insert_own on public.telegram_link_tokens
  for insert with check (auth.uid() = user_id);

create policy tlt_delete_own on public.telegram_link_tokens
  for delete using (auth.uid() = user_id);

grant insert, delete on public.telegram_link_tokens to authenticated;
