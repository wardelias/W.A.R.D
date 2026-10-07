import "server-only";
import { addDays, dayBounds, logicalDay, type IsoDate } from "@/domain/day";
import type { AdminClient } from "@/server/supabase/admin";
import { accessToken, calendarProvider, getConnection, NeedsReconnect } from "./accounts";
import { syncWardBlocks } from "./blocks-sync";
import { toCachedEvent } from "./mapping";
import { CalendarError } from "./provider";

/**
 * One sync pass for one user:
 *   1. W.A.R.D. blocks: push local changes, then apply changes made in Google.
 *   2. Outside calendars: re-read a window (−7 to +35 days) into the cache.
 * Safe to run any time; every step is idempotent.
 */

export type SyncResult = {
  status: "ok" | "partial" | "not_connected" | "needs_reconnect";
  events: number;
  pushed: number;
  pulled: number;
  conflicts: number;
};

export type SyncWindow = {
  from: Date;
  to: Date;
  fromDate: IsoDate;
  toDate: IsoDate;
  today: IsoDate;
};

export function syncWindow(now: Date, timeZone: string, rollover: string): SyncWindow {
  const today = logicalDay(now, timeZone, rollover);
  const fromDate = addDays(today, -7);
  const toDate = addDays(today, 36);
  return {
    from: dayBounds(fromDate, timeZone, rollover).start,
    to: dayBounds(toDate, timeZone, rollover).start,
    fromDate,
    toDate,
    today,
  };
}

function errorCode(e: unknown): string {
  if (e instanceof CalendarError) return e.code;
  if (e instanceof NeedsReconnect) return "needs_reconnect";
  return "other";
}

export async function syncUser(
  admin: AdminClient,
  userId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<SyncResult> {
  const result: SyncResult = { status: "ok", events: 0, pushed: 0, pulled: 0, conflicts: 0 };
  const connection = await getConnection(admin, userId);
  if (!connection) return { ...result, status: "not_connected" };
  if (connection.status !== "active") return { ...result, status: "needs_reconnect" };

  const { data: settings } = await admin
    .from("settings")
    .select("timezone, day_rollover, block_reminders")
    .eq("user_id", userId)
    .single();
  if (!settings) return { ...result, status: "partial" };
  const window = syncWindow(now, settings.timezone, settings.day_rollover);

  let token: string;
  try {
    token = await accessToken(admin, userId);
  } catch (e) {
    if (e instanceof NeedsReconnect) return { ...result, status: "needs_reconnect" };
    throw e;
  }
  const provider = calendarProvider();
  const errors: string[] = [];

  // 1. W.A.R.D. blocks
  if (connection.wardCalendarId) {
    try {
      const blocks = await syncWardBlocks({
        admin,
        provider,
        token,
        userId,
        calendarId: connection.wardCalendarId,
        window,
        timeZone: settings.timezone,
        rollover: settings.day_rollover,
        reminders: settings.block_reminders,
        now,
      });
      result.pushed = blocks.pushed;
      result.pulled = blocks.pulled;
      result.conflicts = blocks.conflicts;
    } catch (e) {
      errors.push(errorCode(e));
    }
  }

  // 2. Outside calendars the user chose to show
  const { data: calendars } = await admin
    .from("calendars")
    .select("google_calendar_id")
    .eq("user_id", userId)
    .eq("selected", true)
    .eq("is_ward", false);

  for (const c of calendars ?? []) {
    try {
      const events = await provider.listEvents(token, c.google_calendar_id, {
        timeMin: window.from,
        timeMax: window.to,
      });
      const rows = events.map(toCachedEvent).filter((r) => r !== null);
      const { error } = await admin.rpc("replace_calendar_window", {
        p_user: userId,
        p_calendar: c.google_calendar_id,
        p_from: window.from.toISOString(),
        p_to: window.to.toISOString(),
        p_from_date: window.fromDate,
        p_to_date: window.toDate,
        p_events: rows,
      });
      if (error) throw new Error(`cache write failed: ${error.code}`);
      result.events += rows.length;
      await admin
        .from("calendars")
        .update({ last_synced_at: now.toISOString(), last_error: null })
        .eq("user_id", userId)
        .eq("google_calendar_id", c.google_calendar_id);
    } catch (e) {
      const code = errorCode(e);
      errors.push(code);
      await admin
        .from("calendars")
        .update({ last_error: code })
        .eq("user_id", userId)
        .eq("google_calendar_id", c.google_calendar_id);
    }
  }

  if (errors.includes("needs_reconnect")) result.status = "needs_reconnect";
  else if (errors.length) result.status = "partial";
  await admin
    .from("google_accounts")
    .update({ last_synced_at: now.toISOString(), last_sync_error: errors[0] ?? null })
    .eq("user_id", userId);
  return result;
}

/** Syncs only when the last sync is older than `maxAgeSeconds`. */
export async function syncIfStale(
  admin: AdminClient,
  userId: string,
  maxAgeSeconds: number,
): Promise<SyncResult | null> {
  const { data } = await admin
    .from("google_accounts")
    .select("last_synced_at, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  if (data.last_synced_at && Date.now() - Date.parse(data.last_synced_at) < maxAgeSeconds * 1000) {
    return null;
  }
  return syncUser(admin, userId);
}
