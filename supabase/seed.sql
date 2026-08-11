-- ============================================================================
-- Development seed (НЕ для production).
-- Заполняет реалистичные русскоязычные примеры для ПЕРВОГО пользователя auth.users.
-- Предварительно зарегистрируйте пользователя (через Supabase Auth), затем выполните этот файл.
-- ============================================================================

do $$
declare
  v_user uuid := (select id from auth.users order by created_at limit 1);
  v_work uuid; v_health uuid; v_growth uuid;
  v_launch uuid; v_habit uuid;
begin
  if v_user is null then
    raise notice 'Нет пользователей в auth.users — сначала зарегистрируйте пользователя. Seed пропущен.';
    return;
  end if;

  -- Сферы жизни
  insert into public.life_areas (user_id, name, color, sort_order)
  values (v_user, 'Работа', '#3b6ea5', 0) returning id into v_work;
  insert into public.life_areas (user_id, name, color, sort_order)
  values (v_user, 'Здоровье', '#2f7d4f', 1) returning id into v_health;
  insert into public.life_areas (user_id, name, color, sort_order)
  values (v_user, 'Развитие', '#7a4fb5', 2) returning id into v_growth;

  -- Цели/проекты (зоны фокуса)
  insert into public.goals (user_id, life_area_id, title, zone, horizon_days)
  values (v_user, v_health, 'Восстановить режим сна и тренировок', 'now', 90);
  insert into public.projects (user_id, life_area_id, title, zone, target_date)
  values (v_user, v_work, 'Запустить новую версию продукта', 'now', current_date + 60)
  returning id into v_launch;

  -- Правило повторения: тренировка по будням
  insert into public.recurrence_rules (user_id, frequency, weekdays, start_date)
  values (v_user, 'weekly', array[1,2,3,4,5]::smallint[], current_date)
  returning id into v_habit;

  -- Задачи
  insert into public.tasks
    (user_id, project_id, title, status, due_date, importance, consequence, goal_link,
     energy_required, planned_minutes, scheduling_mode)
  values
    (v_user, v_launch, 'Согласовать спецификацию релиза с командой', 'planned', current_date,
     5, 4, 5, 4, 90, 'timeblock'),
    (v_user, v_launch, 'Отправить отчёт за прошлый месяц', 'planned', current_date - 2,
     4, 5, 3, 3, 40, 'unordered');

  insert into public.tasks
    (user_id, title, status, importance, consequence, goal_link, energy_required,
     planned_minutes, planned_money, is_recurring, recurrence_rule_id, scheduling_mode)
  values
    (v_user, 'Тренировка 30 минут', 'planned', 3, 2, 4, 2, 30, 0, true, v_habit, 'ordered'),
    (v_user, 'Оплатить счёт за интернет', 'planned', 2, 4, 1, 1, 10, 1500.00, false, null, 'unordered');

  -- Личные события
  insert into public.personal_events (user_id, title, starts_at, ends_at, fixed)
  values
    (v_user, 'Дейли-встреча команды',
      (current_date + time '10:00') at time zone 'Asia/Bishkek',
      (current_date + time '10:30') at time zone 'Asia/Bishkek', true),
    (v_user, 'Обед',
      (current_date + time '13:00') at time zone 'Asia/Bishkek',
      (current_date + time '14:00') at time zone 'Asia/Bishkek', false);

  -- Лимиты ресурсов
  insert into public.resource_limits (user_id, period, resource, limit_value)
  values (v_user, 'day', 'money', 3000.00)
  on conflict do nothing;

  raise notice 'Seed выполнен для пользователя %', v_user;
end $$;
