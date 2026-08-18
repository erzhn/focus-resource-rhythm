/**
 * Интеграционная проверка живой БД Supabase (этап P1.2).
 * Создаёт временных тест-пользователей в ВАШЕМ проекте и удаляет их в конце.
 * Проверяет: наличие таблиц, триггер автосоздания профиля/настроек,
 * изоляцию данных через RLS (свой видит своё, чужой — нет).
 *
 * Запуск:  node scripts/verify-live-db.mjs
 * Читает ключи из .env.local (значения не печатаются).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- Загрузка .env.local ---
function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* нет файла */
  }
  return env;
}
const env = loadEnv();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON || !SERVICE) {
  console.error("Нет ключей в .env.local: нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0;
let fail = 0;
const ok = (m) => {
  console.log(`  ✓ ${m}`);
  pass++;
};
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  fail++;
};

const EXPECTED_TABLES = [
  "profiles", "user_settings", "life_areas", "goals", "projects", "project_stages",
  "tasks", "task_dependencies", "recurrence_rules", "task_occurrences", "personal_events",
  "planning_periods", "planning_items", "daily_checkins", "daily_plans", "daily_plan_items",
  "resource_limits", "resource_entries", "daily_reviews", "weekly_reviews", "postponements",
  "notifications", "calendar_connections", "external_calendars", "calendar_event_links",
  "calendar_sync_states", "calendar_change_requests", "entity_versions", "audit_log",
];

const rnd = () => Math.random().toString(36).slice(2, 10);

async function main() {
  console.log("\n[1] Наличие таблиц (через service role):");
  for (const t of EXPECTED_TABLES) {
    const { error } = await admin.from(t).select("*", { count: "exact", head: true });
    if (error) bad(`${t}: ${error.message}`);
    else ok(t);
  }

  const users = [];
  try {
    console.log("\n[2] Регистрация и триггер автосоздания профиля/настроек:");
    const email1 = `test_${rnd()}@example.com`;
    const email2 = `test_${rnd()}@example.com`;
    const password = `Test-${rnd()}-${rnd()}`;

    const { data: u1, error: e1 } = await admin.auth.admin.createUser({
      email: email1, password, email_confirm: true,
    });
    if (e1) throw new Error("createUser 1: " + e1.message);
    users.push(u1.user.id);
    ok("тест-пользователь #1 создан");

    // Триггер handle_new_user должен был создать profile и user_settings.
    await new Promise((r) => setTimeout(r, 400));
    const prof = await admin.from("profiles").select("id").eq("id", u1.user.id).maybeSingle();
    prof.data ? ok("profiles создан триггером") : bad("profiles НЕ создан триггером");
    const sett = await admin.from("user_settings").select("user_id").eq("user_id", u1.user.id).maybeSingle();
    sett.data ? ok("user_settings создан триггером") : bad("user_settings НЕ создан триггером");

    console.log("\n[3] RLS: пользователь работает со своими данными:");
    const user1 = createClient(URL_, ANON, { auth: { persistSession: false } });
    const s1 = await user1.auth.signInWithPassword({ email: email1, password });
    if (s1.error) throw new Error("signIn 1: " + s1.error.message);
    ok("вход пользователя #1 (Supabase Auth работает)");

    const ins = await user1.from("tasks").insert({ user_id: u1.user.id, title: "Тестовая задача RLS" }).select("id").single();
    if (ins.error) bad("вставка своей задачи: " + ins.error.message);
    else ok("вставка своей задачи разрешена");
    const taskId = ins.data?.id;

    const own = await user1.from("tasks").select("id,title").eq("id", taskId ?? "");
    own.data && own.data.length === 1 ? ok("чтение своей задачи") : bad("не прочитал свою задачу");

    console.log("\n[4] RLS: чужой не видит и не пишет чужое:");
    const { data: u2, error: e2 } = await admin.auth.admin.createUser({
      email: email2, password, email_confirm: true,
    });
    if (e2) throw new Error("createUser 2: " + e2.message);
    users.push(u2.user.id);
    const user2 = createClient(URL_, ANON, { auth: { persistSession: false } });
    const s2 = await user2.auth.signInWithPassword({ email: email2, password });
    if (s2.error) throw new Error("signIn 2: " + s2.error.message);

    const foreignRead = await user2.from("tasks").select("id").eq("id", taskId ?? "");
    (foreignRead.data?.length ?? 0) === 0 ? ok("чужую задачу НЕ видно (изоляция)") : bad("!!! чужая задача видна — RLS не изолирует");

    const spoof = await user2.from("tasks").insert({ user_id: u1.user.id, title: "Подделка" }).select("id");
    spoof.error ? ok("вставка задачи от чужого имени запрещена") : bad("!!! удалось вставить задачу с чужим user_id");
  } catch (err) {
    bad("исключение: " + (err?.message ?? String(err)));
  } finally {
    console.log("\n[5] Очистка тест-пользователей:");
    for (const id of users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      error ? bad(`удаление ${id}: ${error.message}`) : ok(`удалён тест-пользователь`);
    }
  }

  console.log(`\nИТОГ: ✓ ${pass}   ✗ ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
