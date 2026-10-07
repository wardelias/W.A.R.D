import "server-only";
import type { AdminClient } from "@/server/supabase/admin";
import { accessToken, calendarProvider, getConnection, setWardCalendar } from "./accounts";

export const WARD_CALENDAR_NAME = "W.A.R.D.";

/**
 * After connecting (and on "Refresh calendars"): mirrors the calendar list,
 * keeps the user's show/hide choices, and finds or creates the "W.A.R.D."
 * calendar that holds focus and habit blocks.
 */
export async function setupCalendars(admin: AdminClient, userId: string, timeZone: string) {
  const provider = calendarProvider();
  const token = await accessToken(admin, userId);
  const connection = await getConnection(admin, userId);
  const calendars = await provider.listCalendars(token);

  let ward =
    calendars.find((c) => c.id === connection?.wardCalendarId) ??
    calendars.find((c) => c.summary === WARD_CALENDAR_NAME && c.accessRole === "owner");
  if (!ward) {
    ward = await provider.createCalendar(token, WARD_CALENDAR_NAME, timeZone);
    calendars.push(ward);
  }
  await setWardCalendar(admin, userId, ward.id);

  const { data: existing } = await admin
    .from("calendars")
    .select("google_calendar_id, selected")
    .eq("user_id", userId);
  const selected = new Map((existing ?? []).map((c) => [c.google_calendar_id, c.selected]));

  const rows = calendars.map((c) => ({
    user_id: userId,
    google_calendar_id: c.id,
    summary: c.id === ward.id ? WARD_CALENDAR_NAME : c.summary,
    is_ward: c.id === ward.id,
    // New calendars: show the primary one by default. The W.A.R.D. calendar is
    // synced through blocks, not the event cache.
    selected: c.id === ward.id ? false : (selected.get(c.id) ?? c.primary),
  }));
  const { error } = await admin
    .from("calendars")
    .upsert(rows, { onConflict: "user_id,google_calendar_id" });
  if (error) throw new Error(`calendars write failed: ${error.code}`);

  const gone = (existing ?? [])
    .map((c) => c.google_calendar_id)
    .filter((id) => !calendars.some((c) => c.id === id));
  if (gone.length) {
    await admin.from("calendars").delete().eq("user_id", userId).in("google_calendar_id", gone);
  }
  return { wardCalendarId: ward.id, count: calendars.length };
}
