import "server-only";
import { randomUUID } from "node:crypto";
import {
  CalendarError,
  type CalendarProvider,
  type EventInput,
  type GCalendar,
  type GEvent,
} from "./provider";

/**
 * In-memory calendar with Google's semantics (ids, etags, 409 on duplicate
 * ids, 412 on stale etags, cancelled events kept with showDeleted). Used by
 * tests and local demos. State lives on globalThis so it survives hot reload.
 * The "token" is the user id, so each user gets separate calendars.
 */

type Store = {
  calendars: Map<string, GCalendar & { owner: string }>;
  events: Map<string, Map<string, GEvent>>; // calendarId -> eventId -> event
  clock: number;
};

const g = globalThis as unknown as { __wardFakeCalendar?: Store };

export function fakeStore(): Store {
  g.__wardFakeCalendar ??= { calendars: new Map(), events: new Map(), clock: 0 };
  return g.__wardFakeCalendar;
}

export function resetFakeCalendar() {
  g.__wardFakeCalendar = { calendars: new Map(), events: new Map(), clock: 0 };
}

function stamp(store: Store) {
  store.clock++;
  return {
    etag: `"${store.clock}"`,
    // Strictly increasing, and never behind real time.
    updated: new Date(Math.max(Date.now(), store.clock)).toISOString(),
  };
}

function eventsOf(store: Store, calendarId: string, owner: string): Map<string, GEvent> {
  const cal = store.calendars.get(calendarId);
  if (!cal || cal.owner !== owner) throw new CalendarError("not found", 404, "not_found");
  let events = store.events.get(calendarId);
  if (!events) {
    events = new Map();
    store.events.set(calendarId, events);
  }
  return events;
}

function instant(dt?: { dateTime?: string; date?: string }): number {
  if (dt?.dateTime) return Date.parse(dt.dateTime);
  if (dt?.date) return Date.parse(`${dt.date}T00:00:00Z`);
  return 0;
}

/** Creates a user's primary calendar on first use. */
function ensurePrimary(store: Store, owner: string) {
  const id = `primary-${owner}`;
  if (!store.calendars.has(id)) {
    store.calendars.set(id, { id, summary: "Primary", primary: true, accessRole: "owner", owner });
  }
}

export const fakeProvider: CalendarProvider = {
  async listCalendars(owner) {
    const store = fakeStore();
    ensurePrimary(store, owner);
    return [...store.calendars.values()]
      .filter((c) => c.owner === owner)
      .map(({ id, summary, primary, accessRole }) => ({ id, summary, primary, accessRole }));
  },

  async createCalendar(owner, summary) {
    const store = fakeStore();
    const id = `${randomUUID()}@group.calendar.fake`;
    store.calendars.set(id, { id, summary, primary: false, accessRole: "owner", owner });
    return { id, summary, primary: false, accessRole: "owner" };
  },

  async deleteCalendar(owner, calendarId) {
    const store = fakeStore();
    const cal = store.calendars.get(calendarId);
    if (cal?.owner === owner) {
      store.calendars.delete(calendarId);
      store.events.delete(calendarId);
    }
  },

  async listEvents(owner, calendarId, { timeMin, timeMax, showDeleted = false }) {
    const events = eventsOf(fakeStore(), calendarId, owner);
    return [...events.values()]
      .filter((e) => showDeleted || e.status !== "cancelled")
      .filter((e) => instant(e.end) > timeMin.getTime() && instant(e.start) < timeMax.getTime())
      .map((e) => structuredClone(e));
  },

  async getEvent(owner, calendarId, eventId) {
    const e = eventsOf(fakeStore(), calendarId, owner).get(eventId);
    return e ? structuredClone(e) : null;
  },

  async insertEvent(owner, calendarId, input: EventInput) {
    const store = fakeStore();
    const events = eventsOf(store, calendarId, owner);
    const id = input.id ?? randomUUID().replace(/-/g, "");
    if (events.has(id)) throw new CalendarError("duplicate", 409, "conflict");
    const event: GEvent = { status: "confirmed", ...structuredClone(input), id, ...stamp(store) };
    events.set(id, event);
    return structuredClone(event);
  },

  async patchEvent(owner, calendarId, eventId, patch, etag) {
    const store = fakeStore();
    const events = eventsOf(store, calendarId, owner);
    const current = events.get(eventId);
    if (!current) throw new CalendarError("not found", 404, "not_found");
    if (etag && current.etag !== etag) throw new CalendarError("stale etag", 412, "precondition");
    const next: GEvent = { ...current, ...structuredClone(patch), id: eventId, ...stamp(store) };
    if (current.status === "cancelled" && !("status" in patch)) next.status = "cancelled";
    events.set(eventId, next);
    return structuredClone(next);
  },

  async deleteEvent(owner, calendarId, eventId) {
    const store = fakeStore();
    const events = eventsOf(store, calendarId, owner);
    const current = events.get(eventId);
    if (!current || current.status === "cancelled") return;
    events.set(eventId, { ...current, status: "cancelled", ...stamp(store) });
  },
};

/** Test helpers: change events "in Google" behind W.A.R.D.'s back. */
export const fakeGoogleSide = {
  addEvent(
    owner: string,
    calendarId: string,
    event: Omit<GEvent, "id" | "etag" | "updated"> & { id?: string },
  ) {
    return fakeProvider.insertEvent(owner, calendarId, event as EventInput);
  },
  moveEvent(owner: string, calendarId: string, eventId: string, start: string, end: string) {
    return fakeProvider.patchEvent(owner, calendarId, eventId, {
      start: { dateTime: start },
      end: { dateTime: end },
    });
  },
  deleteEvent(owner: string, calendarId: string, eventId: string) {
    return fakeProvider.deleteEvent(owner, calendarId, eventId);
  },
  addCalendar(owner: string, summary: string) {
    return fakeProvider.createCalendar(owner, summary, "UTC");
  },
};
