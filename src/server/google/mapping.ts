import { stripIsolates } from "@/domain/text";
import type { GEvent } from "./provider";

/** A cached outside event, as stored in calendar_events. */
export type CachedEvent = {
  id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  start_date: string | null;
  end_date: string | null;
  all_day: boolean;
  busy: boolean;
  status: "confirmed" | "tentative";
  html_link: string | null;
};

const MAX_TITLE = 1024;

/**
 * Maps a Google event to the cache row, or null for events that shouldn't
 * be shown (cancelled, or missing times). Only title, times, busy and link
 * are kept: no description, location or attendees.
 */
export function toCachedEvent(e: GEvent): CachedEvent | null {
  if (e.status === "cancelled") return null;
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  if (allDay && (!e.start?.date || !e.end?.date)) return null;
  if (!allDay && (!e.start?.dateTime || !e.end?.dateTime)) return null;
  const title = [...(e.summary ?? "").trim()].slice(0, MAX_TITLE).join("") || "(no title)";
  return {
    id: e.id,
    title,
    starts_at: allDay ? null : new Date(e.start!.dateTime!).toISOString(),
    ends_at: allDay ? null : new Date(e.end!.dateTime!).toISOString(),
    start_date: allDay ? e.start!.date! : null,
    end_date: allDay ? e.end!.date! : null,
    all_day: allDay,
    busy: e.transparency !== "transparent",
    status: e.status === "tentative" ? "tentative" : "confirmed",
    html_link: e.htmlLink && e.htmlLink.startsWith("https://") ? e.htmlLink.slice(0, 2048) : null,
  };
}

/** Title of a W.A.R.D. block as written to Google, read back without isolates. */
export function blockTitleFromEvent(e: GEvent): string | null {
  const summary = e.summary?.trim();
  return summary ? stripIsolates(summary) : null;
}
