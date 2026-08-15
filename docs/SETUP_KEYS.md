# Настройка Supabase и OAuth-ключей — пошагово

Что где брать и куда вставлять. Все значения идут в файл **`.env.local`** в корне проекта
(`D:\PET-projects\planning`). Этот файл в `.gitignore` — в репозиторий он не попадает.

## 0. Создать `.env.local`

Скопируйте шаблон и откройте на редактирование:

```bash
cp .env.example .env.local
```

Минимум, чтобы выйти из демо-режима, — только два первых значения Supabase. Остальное (шифрование,
OAuth) нужно лишь для синхронизации календарей.

---

## 1. Supabase (обязательно для реального хранения)

### 1.1. Создать проект
1. Зарегистрируйтесь на <https://supabase.com> → **New project**.
2. Имя проекта, регион — ближайший (например, Frankfurt/EU или Singapore).
3. Придумайте **Database password** и сохраните его (пригодится для миграций).
4. Дождитесь готовности проекта (~2 минуты).

### 1.2. Взять ключи
Dashboard проекта → ⚙️ **Project Settings → API** (или **API Keys**):

| Значение в Supabase | Переменная в `.env.local` |
|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon / public** ключ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role / secret** ключ | `SUPABASE_SERVICE_ROLE_KEY` (пока не используется кодом — можно оставить пустым) |

> `anon` ключ безопасен для клиента — доступ ограничивает RLS. `service_role` — секретный, только
> для сервера, в клиент никогда не попадает.

### 1.3. Применить миграции (создать таблицы + RLS)

**Вариант А — Supabase CLI (рекомендуется):**
```bash
npx supabase login          # откроется браузер для входа
npx supabase link --project-ref <PROJECT_REF>   # REF виден в URL проекта и в Settings
npx supabase db push        # применит supabase/migrations/* на чистую базу
```
`<PROJECT_REF>` — короткий идентификатор проекта (например `abcdxyz012345`), он в адресе дашборда
`https://supabase.com/dashboard/project/<PROJECT_REF>`.

**Вариант Б — вручную через SQL Editor:**
Dashboard → **SQL Editor → New query** → по очереди вставьте и запустите содержимое файлов из
`supabase/migrations/` **в порядке номеров** (0001 → 0006).

### 1.4. Разрешить вход без подтверждения почты (для локальной разработки)
Dashboard → **Authentication → Providers → Email** → выключите **Confirm email** (иначе после
регистрации Supabase ждёт письмо, а SMTP локально не настроен).

### 1.5. (Необязательно) Загрузить демо-данные
Сначала зарегистрируйтесь в приложении (см. ниже), затем в SQL Editor вставьте и выполните
`supabase/seed.sql` — он заполнит примеры для первого пользователя.

После этого приложение **само** переключится из демо-режима в реальный (по наличию
`NEXT_PUBLIC_SUPABASE_URL` и anon-ключа). Перезапустите `npm run dev`.

---

## 2. Ключ шифрования токенов (нужен для календарей)

Сгенерируйте 32-байтовый ключ в base64 и вставьте в `TOKEN_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Скопируйте вывод → `TOKEN_ENCRYPTION_KEY=...`

---

## 3. Google Calendar OAuth (для синхронизации с Google)

1. <https://console.cloud.google.com> → создайте проект (или выберите существующий).
2. **APIs & Services → Library** → найдите **Google Calendar API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - тип **External**, укажите название приложения и email поддержки;
   - в разделе **Test users** добавьте свой Google-аккаунт (пока приложение в статусе Testing).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type: Web application**;
   - **Authorized redirect URIs** → добавьте точно:
     `http://localhost:3000/api/integrations/google/callback`
5. Скопируйте значения:

| Google | Переменная |
|---|---|
| **Client ID** | `GOOGLE_CLIENT_ID` |
| **Client secret** | `GOOGLE_CLIENT_SECRET` |
| (оставить как есть) | `GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback` |

---

## 4. Microsoft Outlook OAuth (для синхронизации с Microsoft)

1. <https://portal.azure.com> → **Microsoft Entra ID (Azure AD) → App registrations → New registration**.
2. Настройки регистрации:
   - имя приложения;
   - **Supported account types**: «Accounts in any organizational directory and personal Microsoft
     accounts» (для `tenant = common`);
   - **Redirect URI**: платформа **Web**, значение
     `http://localhost:3000/api/integrations/microsoft/callback`.
3. На странице **Overview** скопируйте:

| Azure | Переменная |
|---|---|
| **Application (client) ID** | `MICROSOFT_CLIENT_ID` |
| **Directory (tenant) ID** | `MICROSOFT_TENANT_ID` (или оставьте `common`) |

4. **Certificates & secrets → New client secret** → скопируйте **Value** (именно значение, не Secret
   ID) → `MICROSOFT_CLIENT_SECRET`. (Значение показывается один раз — сразу сохраните.)
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions** → добавьте
   `Calendars.ReadWrite` и `offline_access`.

---

## 5. Итоговый `.env.local`

```
# — обязательно для реального режима —
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=          # опционально, пока не используется

# — для календарей —
TOKEN_ENCRYPTION_KEY=<base64-32-байта>

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/integrations/microsoft/callback

APP_BASE_URL=http://localhost:3000
```

## 6. Запуск

```bash
npm run dev
```
1. Перезапустите сервер после изменения `.env.local` (переменные `NEXT_PUBLIC_*` читаются при старте).
2. Откройте <http://localhost:3000> → вас перенаправит на `/login`.
3. Зарегистрируйтесь → пройдите онбординг → попадёте на «Сегодня».
4. Календари подключаются в **Настройки → Интеграции календарей**.

## 7. Частые проблемы
- **После входа снова кидает на /login** — не отключён Confirm email (шаг 1.4) или неверный anon-ключ.
- **`redirect_uri_mismatch`** — URI в Google/Azure должен совпадать с `.env.local` символ в символ.
- **Кнопка «Подключить» возвращает в настройки** — не заданы OAuth-ключи или `TOKEN_ENCRYPTION_KEY`.
- **Пусто после перезагрузки** — приложение всё ещё в демо-режиме (нет Supabase-URL/anon).
