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
 * Адаптер Microsoft Outlook (Graph, OAuth 2.0 + delta query + change notifications).
 * Требует MICROSOFT_CLIENT_ID/SECRET/TENANT_ID/REDIRECT_URI.
 *
 * Документация (перепроверять перед реализацией):
 * https://learn.microsoft.com/graph/delta-query-events
 */
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["offline_access", "Calendars.ReadWrite"];

function config() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  const tenant = process.env.MICROSOFT_TENANT_ID || "common";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new IntegrationError("Не заданы ключи Microsoft OAuth", "microsoft");
  }
  return { clientId, clientSecret, redirectUri, tenant };
}

const authBase = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;

export const microsoftProvider: CalendarProvider = {
  name: "microsoft",

  buildAuthUrl(state, codeChallenge) {
    const { clientId, redirectUri, tenant } = config();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${authBase(tenant)}/authorize?${params.toString()}`;
  },

  async exchangeCode(code, codeVerifier) {
    const { clientId, clientSecret, redirectUri, tenant } = config();
    const res = await fetch(`${authBase(tenant)}/token`, {
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
    if (!res.ok) throw new IntegrationError("Обмен кода не удался", "microsoft");
    return toTokens(await res.json());
  },

  async refresh(refreshToken) {
    const { clientId, clientSecret, tenant } = config();
    const res = await fetch(`${authBase(tenant)}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new IntegrationError("Обновление токена не удалось", "microsoft");
    return toTokens(await res.json(), refreshToken);
  },

  async listCalendars(accessToken): Promise<ExternalCalendar[]> {
    const res = await fetch(`${GRAPH}/me/calendars`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new IntegrationError("Не удалось получить список календарей", "microsoft");
    const data = await res.json();
    return (data.value ?? []).map((c: { id: string; name: string }) => ({
      externalId: c.id,
      name: c.name,
    }));
  },

  async upsertEvent(accessToken, input: UpsertEventInput): Promise<ExternalEvent> {
    const body = {
      subject: input.summary,
      body: { contentType: "text", content: input.description },
      start: { dateTime: input.start.toISOString(), timeZone: "UTC" },
      end: { dateTime: input.end.toISOString(), timeZone: "UTC" },
    };
    const base = `${GRAPH}/me/calendars/${input.externalCalendarId}/events`;
    const url = input.externalEventId ? `${GRAPH}/me/events/${input.externalEventId}` : base;
    const res = await fetch(url, {
      method: input.externalEventId ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new IntegrationError("Не удалось сохранить событие", "microsoft");
    return toEvent(await res.json());
  },

  async deleteEvent(accessToken, _externalCalendarId, externalEventId): Promise<void> {
    const res = await fetch(`${GRAPH}/me/events/${externalEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new IntegrationError("Не удалось удалить событие", "microsoft");
    }
  },

  async incrementalSync(accessToken, externalCalendarId, syncState): Promise<IncrementalSyncResult> {
    const url =
      syncState ??
      `${GRAPH}/me/calendars/${externalCalendarId}/calendarView/delta`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 410) return { events: [], nextSyncState: null, needsFullResync: true };
    if (!res.ok) throw new IntegrationError("Delta-синхронизация не удалась", "microsoft");
    const data = await res.json();
    return {
      events: (data.value ?? []).map(toEvent),
      nextSyncState: data["@odata.deltaLink"] ?? data["@odata.nextLink"] ?? null,
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
  const start = e.start as { dateTime?: string } | undefined;
  const end = e.end as { dateTime?: string } | undefined;
  const bodyContent = (e.body as { content?: string } | undefined)?.content ?? null;
  return {
    externalId: String(e.id),
    summary: (e.subject as string) ?? "",
    start: new Date(start?.dateTime ?? Date.now()),
    end: new Date(end?.dateTime ?? Date.now()),
    description: bodyContent,
    version: (e["@odata.etag"] as string) ?? null,
    updatedAt: e.lastModifiedDateTime ? new Date(String(e.lastModifiedDateTime)) : null,
    deleted: Boolean((e as Record<string, unknown>)["@removed"]),
  };
}
