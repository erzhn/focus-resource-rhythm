# Модель данных

Все пользовательские таблицы содержат `user_id` и защищены RLS (`auth.uid() = user_id`).
Метки времени — `timestamptz` (UTC). Деньги — `numeric(14,2)`. Миграции: `supabase/migrations/`.

## ER-диаграмма (основные сущности)

```mermaid
erDiagram
  profiles ||--|| user_settings : has
  profiles ||--o{ life_areas : owns
  life_areas ||--o{ goals : groups
  goals ||--o{ projects : contains
  projects ||--o{ project_stages : has
  goals ||--o{ tasks : ""
  projects ||--o{ tasks : ""
  project_stages ||--o{ tasks : ""
  tasks ||--o{ task_dependencies : "depends"
  recurrence_rules ||--o{ tasks : "rule"
  tasks ||--o{ task_occurrences : "instances"
  profiles ||--o{ personal_events : has

  planning_periods ||--o{ planning_items : contains
  daily_plans ||--o{ daily_plan_items : contains
  tasks ||--o{ daily_plan_items : ""
  profiles ||--o{ daily_checkins : logs
  resource_limits }o--|| profiles : ""
  resource_entries }o--|| profiles : ""

  daily_reviews }o--|| profiles : ""
  weekly_reviews }o--|| profiles : ""
  tasks ||--o{ postponements : "with reason"
  profiles ||--o{ notifications : receives

  calendar_connections ||--o{ external_calendars : lists
  external_calendars ||--o{ calendar_event_links : links
  external_calendars ||--|| calendar_sync_states : state
  calendar_event_links ||--o{ calendar_change_requests : "was/now"

  profiles ||--o{ entity_versions : history
  profiles ||--o{ audit_log : actions
```

## Группы таблиц

- **Идентичность/настройки**: `profiles`, `user_settings`.
- **Иерархия**: `life_areas`, `goals`, `projects`, `project_stages`.
- **Задачи**: `tasks`, `task_dependencies`, `recurrence_rules`, `task_occurrences`, `personal_events`.
- **Планирование/ресурсы**: `planning_periods`, `planning_items`, `daily_checkins`, `daily_plans`,
  `daily_plan_items`, `resource_limits`, `resource_entries`.
- **Ритм/итоги**: `daily_reviews`, `weekly_reviews`, `postponements`, `notifications`.
- **Календари**: `calendar_connections`, `external_calendars`, `calendar_event_links`,
  `calendar_sync_states`, `calendar_change_requests`.
- **История**: `entity_versions`, `audit_log`.

## Ключевые ограничения

- Зоны фокуса — enum `focus_zone`; статусы — enum `task_status`.
- Циклические зависимости задач запрещены триггером `prevent_task_dependency_cycle`.
- `postponements.reason` обязателен (перенос всегда с причиной).
- Не более одного календаря по умолчанию для исходящих (частичный уникальный индекс).
- Профиль и настройки создаются автоматически при регистрации (`handle_new_user`).
