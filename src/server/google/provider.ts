import "server-only";

/**
 * Everything W.A.R.D. needs from a calendar backend. The Google
 * implementation talks to the Calendar API; the fake keeps events in memory
 * for tests and local demos (CALENDAR_PROVIDER=fake).
 */

export type GDateTime = { dateTime?: string; date?: string; timeZone?: string };

export type GEvent = {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  start?: GDateTime;
  end?: GDateTime;
  updated?: string;
  etag?: string;
  transparency?: "opaque" | "transparent";
  htmlLink?: string;
  extendedProperties?: { private?: Record<string, string> };
  reminders?: { useDefault: boolean; overrides?: { method: "popup" | "email"; minutes: number }[] };
};

export type GCalendar = { id: string; summary: string; primary: boolean; accessRole: string };

export type EventInput = Partial<
  Pick<
    GEvent,
    "summary" | "start" | "end" | "extendedProperties" | "reminders" | "transparency" | "status"
  >
> & {
  id?: string;
};

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      "not_found" | "gone" | "conflict" | "precondition" | "auth" | "rate_limit" | "other",
  ) {
    super(message);
    this.name = "CalendarError";
  }
}

export interface CalendarProvider {
  listCalendars(token: string): Promise<GCalendar[]>;
  createCalendar(token: string, summary: string, timeZone: string): Promise<GCalendar>;
  deleteCalendar(token: string, calendarId: string): Promise<void>;
  listEvents(
    token: string,
    calendarId: string,
    range: { timeMin: Date; timeMax: Date; showDeleted?: boolean },
  ): Promise<GEvent[]>;
  getEvent(token: string, calendarId: string, eventId: string): Promise<GEvent | null>;
  insertEvent(token: string, calendarId: string, event: EventInput): Promise<GEvent>;
  patchEvent(
    token: string,
    calendarId: string,
    eventId: string,
    patch: EventInput,
    etag?: string,
  ): Promise<GEvent>;
  deleteEvent(token: string, calendarId: string, eventId: string): Promise<void>;
}

/** Google event ids allow [a-v0-9]; a UUID without hyphens fits and makes inserts idempotent. */
export function eventIdForBlock(blockId: string): string {
  return blockId.replace(/-/g, "").toLowerCase();
}

export function blockIdFromEventId(eventId: string): string | null {
  if (!/^[0-9a-f]{32}$/.test(eventId)) return null;
  return `${eventId.slice(0, 8)}-${eventId.slice(8, 12)}-${eventId.slice(12, 16)}-${eventId.slice(16, 20)}-${eventId.slice(20)}`;
}
