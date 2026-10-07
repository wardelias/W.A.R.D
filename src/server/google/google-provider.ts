import "server-only";
import {
  CalendarError,
  type CalendarProvider,
  type EventInput,
  type GCalendar,
  type GEvent,
} from "./provider";

const BASE = "https://www.googleapis.com/calendar/v3";

function errorCode(status: number): CalendarError["code"] {
  if (status === 404) return "not_found";
  if (status === 410) return "gone";
  if (status === 409) return "conflict";
  if (status === 412) return "precondition";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  return "other";
}

async function call<T>(
  token: string,
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    // Never log bodies: they can contain event titles.
    throw new CalendarError(
      `Google Calendar ${init.method ?? "GET"} failed (${res.status})`,
      res.status,
      errorCode(res.status),
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const googleProvider: CalendarProvider = {
  async listCalendars(token) {
    const out: GCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const page = await call<{
        items?: {
          id: string;
          summary?: string;
          summaryOverride?: string;
          primary?: boolean;
          accessRole: string;
        }[];
        nextPageToken?: string;
      }>(token, "/users/me/calendarList", {
        query: { maxResults: "250", ...(pageToken ? { pageToken } : {}) },
      });
      for (const c of page.items ?? []) {
        out.push({
          id: c.id,
          summary: c.summaryOverride ?? c.summary ?? c.id,
          primary: Boolean(c.primary),
          accessRole: c.accessRole,
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  },

  async createCalendar(token, summary, timeZone) {
    const c = await call<{ id: string; summary: string }>(token, "/calendars", {
      method: "POST",
      body: JSON.stringify({ summary, timeZone }),
    });
    return { id: c.id, summary: c.summary, primary: false, accessRole: "owner" };
  },

  async deleteCalendar(token, calendarId) {
    try {
      await call(token, `/calendars/${enc(calendarId)}`, { method: "DELETE" });
    } catch (e) {
      if (e instanceof CalendarError && (e.code === "not_found" || e.code === "gone")) return;
      throw e;
    }
  },

  async listEvents(token, calendarId, { timeMin, timeMax, showDeleted = false }) {
    const out: GEvent[] = [];
    let pageToken: string | undefined;
    do {
      const page = await call<{ items?: GEvent[]; nextPageToken?: string }>(
        token,
        `/calendars/${enc(calendarId)}/events`,
        {
          query: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: "true",
            showDeleted: String(showDeleted),
            maxResults: "2500",
            ...(pageToken ? { pageToken } : {}),
          },
        },
      );
      out.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  },

  async getEvent(token, calendarId, eventId) {
    try {
      return await call<GEvent>(token, `/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
    } catch (e) {
      if (e instanceof CalendarError && (e.code === "not_found" || e.code === "gone")) return null;
      throw e;
    }
  },

  async insertEvent(token, calendarId, event: EventInput) {
    return call<GEvent>(token, `/calendars/${enc(calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(event),
    });
  },

  async patchEvent(token, calendarId, eventId, patch, etag) {
    return call<GEvent>(token, `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      headers: etag ? { "If-Match": etag } : {},
    });
  },

  async deleteEvent(token, calendarId, eventId) {
    try {
      await call(token, `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
        method: "DELETE",
      });
    } catch (e) {
      if (e instanceof CalendarError && (e.code === "not_found" || e.code === "gone")) return;
      throw e;
    }
  },
};
