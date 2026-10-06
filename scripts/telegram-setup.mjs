#!/usr/bin/env node
/**
 * Регистрация Telegram-бота: вебхук + меню команд.
 *
 * Запускается один раз после деплоя и после каждой смены домена или секрета.
 * Скрипт ничего не придумывает: токен, секрет и адрес берутся из переменных
 * окружения или из аргументов — если чего-то нет, он об этом говорит и выходит.
 *
 *   node scripts/telegram-setup.mjs https://ваш-домен.vercel.app
 *
 * Переменные: TELEGRAM_BOT_TOKEN (обязательна), TELEGRAM_WEBHOOK_SECRET
 * (настоятельно рекомендуется — без неё вебхук примет что угодно от кого угодно).
 * Адрес можно задать через APP_URL вместо аргумента.
 */

import { readFileSync } from "node:fs";

const API = "https://api.telegram.org";

/** .env.local читаем сами: Node не делает этого, а класть токен в аргументы небезопасно. */
function loadEnvFile(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key]) continue; // окружение важнее файла
      process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Файла может не быть — это нормально, переменные придут из окружения.
  }
}

async function call(token, method, body) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`${method}: ${data.description ?? res.status}`);
  return data.result;
}

async function main() {
  loadEnvFile();

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const base = (process.argv[2] ?? process.env.APP_URL ?? "").trim().replace(/\/+$/, "");

  if (!token) {
    console.error("Нет TELEGRAM_BOT_TOKEN. Получите токен у @BotFather и задайте переменную.");
    process.exit(1);
  }
  if (!base || !/^https:\/\//.test(base)) {
    console.error("Укажите адрес приложения: node scripts/telegram-setup.mjs https://ваш-домен");
    console.error("Telegram принимает только https.");
    process.exit(1);
  }
  if (!secret) {
    console.error(
      "Нет TELEGRAM_WEBHOOK_SECRET. Без него вебхук примет запрос от кого угодно.\n" +
        "Сгенерируйте: node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\"",
    );
    process.exit(1);
  }

  const me = await call(token, "getMe");
  console.log(`Бот: @${me.username} (${me.first_name})`);

  const url = `${base}/api/telegram/webhook`;
  await call(token, "setWebhook", {
    url,
    secret_token: secret,
    // Лишние типы обновлений боту не нужны и только создают нагрузку.
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  });
  console.log(`Вебхук: ${url}`);

  // Меню команд — чтобы в Telegram они подсказывались, а не запоминались наизусть.
  await call(token, "setMyCommands", {
    commands: [
      { command: "today", description: "итог за сегодня" },
      { command: "month", description: "итог за месяц" },
      { command: "undo", description: "удалить последнюю запись" },
      { command: "in", description: "проверить план и записать вход" },
      { command: "log", description: "записать совершённую сделку" },
      { command: "open", description: "открытые позиции" },
      { command: "out", description: "закрыть остаток" },
      { command: "partial", description: "закрыть часть позиции" },
      { command: "stop", description: "перенести стоп" },
      { command: "balance", description: "баланс торгового счёта" },
      { command: "account", description: "выбрать торговый счёт" },
      { command: "help", description: "что я умею" },
    ],
  });
  console.log("Меню команд обновлено");

  const info = await call(token, "getWebhookInfo");
  console.log(
    `Проверка: url=${info.url || "—"}, секрет=${info.has_custom_certificate === false && info.url ? "принят" : "?"}` +
      `, ожидает доставки=${info.pending_update_count ?? 0}`,
  );
  if (info.last_error_message) {
    console.log(`Последняя ошибка доставки: ${info.last_error_message}`);
  }

  console.log(
    `\nГотово. Дальше: приложение → Настройки → Telegram-бот → «Получить код» → отправьте боту` +
      ` /start КОД (код одноразовый, живёт 15 минут).`,
  );
}

main().catch((e) => {
  console.error(`Не получилось: ${e.message}`);
  process.exit(1);
});
