/**
 * Чистый выбор адреса возврата OAuth (тестируется без сети и сервера).
 *
 * Важно: buildAuthUrl и exchangeCode обязаны получить ОДИН И ТОТ ЖЕ адрес,
 * иначе провайдер ответит redirect_uri_mismatch. Поэтому значение выводится
 * только из окружения, а не из конкретного HTTP-запроса.
 */

export type ProviderName = "google" | "microsoft";
type Env = Record<string, string | undefined>;

const stripSlash = (s: string) => s.replace(/\/+$/, "");
const clean = (s: string | undefined) => s?.trim() || "";

/** Адрес указывает на машину разработчика? */
function isLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(url);
}

/**
 * В облаке localhost-адрес заведомо нерабочий: пользователя уведёт на его же
 * машину. Такое значение попадает в переменные по недосмотру (скопировали
 * пример для локальной разработки), поэтому в облаке его игнорируем.
 */
const isCloud = (env: Env) => Boolean(clean(env.VERCEL));
const usable = (env: Env, url: string) => Boolean(url) && !(isCloud(env) && isLocal(url));

/** Базовый URL приложения: APP_BASE_URL → продакшен-домен Vercel → домен деплоя → localhost. */
export function pickBaseUrl(env: Env): string {
  const appBase = clean(env.APP_BASE_URL);
  if (usable(env, appBase)) return stripSlash(appBase);

  // Стабильный продакшен-домен проекта (не меняется от деплоя к деплою).
  const prod = clean(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (prod) return `https://${stripSlash(prod)}`;

  // Домен конкретного деплоя — для preview-окружений.
  const deploy = clean(env.VERCEL_URL);
  if (deploy) return `https://${stripSlash(deploy)}`;

  return "http://localhost:3000";
}

export function pickRedirectUri(env: Env, provider: ProviderName): string {
  // Явно заданный адрес побеждает — кроме localhost в облаке (см. usable).
  const explicit = clean(provider === "google" ? env.GOOGLE_REDIRECT_URI : env.MICROSOFT_REDIRECT_URI);
  if (usable(env, explicit)) return explicit;
  return `${pickBaseUrl(env)}/api/integrations/${provider}/callback`;
}
