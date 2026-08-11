/**
 * Единый интерфейс внешнего календаря. Google и Microsoft реализуют его,
 * чтобы доменная логика не дублировалась. Активируется при наличии OAuth-ключей.
 */

export type ProviderName = "google" | "microsoft";

export interface ExternalCalendar {
  externalId: string;
  name: string;
}

export interface ExternalEvent {
  externalId: string;
  summary: string;
  start: Date;
  end: Date;
  description: string | null;
  /** Версия для разрешения конфликтов (etag/changeKey). */
  version: string | null;
  updatedAt: Date | null;
  deleted?: boolean;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

export interface UpsertEventInput {
  externalCalendarId: string;
  externalEventId?: string | null;
  summary: string;
  start: Date;
  end: Date;
  description: string;
}

export interface IncrementalSyncResult {
  events: ExternalEvent[];
  /** Новый токен для следующей инкрементальной синхронизации. */
  nextSyncState: string | null;
  /** true, если токен инвалидирован и нужен полный ресинк. */
  needsFullResync: boolean;
}

export interface CalendarProvider {
  readonly name: ProviderName;
  /** URL для начала OAuth (со state и PKCE, минимальные scopes). */
  buildAuthUrl(state: string, codeChallenge: string): string;
  /** Обмен кода авторизации на токены. */
  exchangeCode(code: string, codeVerifier: string): Promise<OAuthTokens>;
  /** Обновление access-токена по refresh-токену. */
  refresh(refreshToken: string): Promise<OAuthTokens>;
  /** Список доступных календарей пользователя. */
  listCalendars(accessToken: string): Promise<ExternalCalendar[]>;
  /** Создать или обновить событие (идемпотентно по externalEventId). */
  upsertEvent(accessToken: string, input: UpsertEventInput): Promise<ExternalEvent>;
  /** Удалить событие. */
  deleteEvent(accessToken: string, externalCalendarId: string, externalEventId: string): Promise<void>;
  /** Инкрементальная синхронизация (Google syncToken / MS delta). */
  incrementalSync(
    accessToken: string,
    externalCalendarId: string,
    syncState: string | null,
  ): Promise<IncrementalSyncResult>;
}

/** Общая ошибка интеграции — не раскрывает секретов. */
export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderName,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}
