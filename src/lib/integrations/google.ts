import "server-only";
import {
  IntegrationError,
  type CalendarProvider,
  type ExternalCalendar,
  type ExternalEvent,
  type IncrementalSyncResult,
  type OAuthTokens,
  type UpsertEventInput,
} from "./provider";

/**
 * Адаптер Google Calendar (OAuth 2.0 + Events API + incremental sync по nextSyncToken).
 * Требует GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI. Без ключей методы бросают IntegrationError.
 *
 * Официальная документация (перепроверять перед реализацией деталей):
 * https://developers.google.com/workspace/calendar/api/guides/sync
 */
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
// Минимально необходимые scopes.
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new IntegrationError("Не заданы ключи Google OAuth", "google");
  }
  return { clientId, clientSecret, redirectUri };
}

export const googleProvider: CalendarProvider = {
  name: "google",

  buildAuthUrl(state, codeChallenge) {
    const { clientId, redirectUri } = config();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${AUTH}?${params.toString()}`;
  },

  async exchangeCode(code, codeVerifier) {
    const { clientId, clientSecret, redirectUri } = config();
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });
    if (!res.ok) throw new IntegrationError("Обмен кода не удался", "google");
    return toTokens(await res.json());
  },

  async refresh(refreshToken) {
    const { clientId, clientSecret } = config();
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new IntegrationError("Обновление токена не удалось", "google");
    return toTokens(await res.json(), refreshToken);
  },

  async listCalendars(accessToken): Promise<ExternalCalendar[]> {
    const res = await fetch(`${API}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new IntegrationError("Не удалось получить список календарей", "google");
    const data = await res.json();
    return (data.items ?? []).map((c: { id: string; summary: string }) => ({
      externalId: c.id,
      name: c.summary,
    }));
  },

  async upsertEvent(accessToken, input: UpsertEventInput): Promise<ExternalEvent> {
    const body = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
    };
    const base = `${API}/calendars/${encodeURIComponent(input.externalCalendarId)}/events`;
    const url = input.externalEventId ? `${base}/${input.externalEventId}` : base;
    const res = await fetch(url, {
      method: input.externalEventId ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new IntegrationError("Не удалось сохранить событие", "google");
    return toEvent(await res.json());
  },

  async deleteEvent(accessToken, externalCalendarId, externalEventId): Promise<void> {
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(externalCalendarId)}/events/${externalEventId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok && res.status !== 410) {
      throw new IntegrationError("Не удалось удалить событие", "google");
    }
  },

  async incrementalSync(accessToken, externalCalendarId, syncState): Promise<IncrementalSyncResult> {
    const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true" });
    if (syncState) params.set("syncToken", syncState);
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(externalCalendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    // 410 Gone → syncToken инвалидирован, нужен полный ресинк.
    if (res.status === 410) return { events: [], nextSyncState: null, needsFullResync: true };
    if (!res.ok) throw new IntegrationError("Инкрементальная синхронизация не удалась", "google");
    const data = await res.json();
    return {
      events: (data.items ?? []).map(toEvent),
      nextSyncState: data.nextSyncToken ?? null,
      needsFullResync: false,
    };
  },
};

function toTokens(json: Record<string, unknown>, fallbackRefresh?: string): OAuthTokens {
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: (json.refresh_token as string) ?? fallbackRefresh ?? null,
    expiresAt: json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000) : null,
    scopes: SCOPES,
  };
}

function toEvent(e: Record<string, unknown>): ExternalEvent {
  const start = e.start as { dateTime?: string; date?: string } | undefined;
  const end = e.end as { dateTime?: string; date?: string } | undefined;
  return {
    externalId: String(e.id),
    summary: (e.summary as string) ?? "",
    start: new Date(start?.dateTime ?? start?.date ?? Date.now()),
    end: new Date(end?.dateTime ?? end?.date ?? Date.now()),
    description: (e.description as string) ?? null,
    version: (e.etag as string) ?? null,
    updatedAt: e.updated ? new Date(String(e.updated)) : null,
    deleted: e.status === "cancelled",
  };
}
