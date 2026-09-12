import "server-only";
import { pickBaseUrl, pickRedirectUri } from "./redirect-uri.pure";

/**
 * Адрес возврата OAuth. Раньше брался только из GOOGLE/MICROSOFT_REDIRECT_URI —
 * при деплое переменную забыли обновить, и прод уводил пользователя на localhost.
 * Теперь он выводится из окружения, поэтому смена домена не ломает интеграцию.
 */
export const resolveRedirectUri = (provider: "google" | "microsoft") =>
  pickRedirectUri(process.env, provider);

export const resolveBaseUrl = () => pickBaseUrl(process.env);
