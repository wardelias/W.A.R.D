"use server";

import { refresh } from "next/cache";
import { run, type ActionResult } from "@/server/actions/run";
import { getContext } from "@/server/context";
import { disconnect } from "@/server/google/accounts";
import { setupCalendars } from "@/server/google/setup";
import { syncIfStale, syncUser } from "@/server/google/sync";
import { createAdminClient } from "@/server/supabase/admin";
import { z } from "zod";

/**
 * Background sync when a screen opens. Returns whether anything ran, so the
 * client refreshes only then (no refresh loops).
 */
export async function syncOnOpenAction(): Promise<{ synced: boolean; needsReconnect: boolean }> {
  try {
    const ctx = await getContext();
    const result = await syncIfStale(createAdminClient(), ctx.userId, 60);
    return { synced: Boolean(result), needsReconnect: result?.status === "needs_reconnect" };
  } catch {
    return { synced: false, needsReconnect: false };
  }
}

export async function syncNowAction(): Promise<ActionResult> {
  const result = await run(async (ctx) => {
    const admin = createAdminClient();
    await setupCalendars(admin, ctx.userId, ctx.settings.timezone);
    return syncUser(admin, ctx.userId);
  });
  if (!result.ok) return result;
  if (result.data?.status === "needs_reconnect") {
    return { ok: false, error: "Google Calendar access stopped working. Reconnect it." };
  }
  if (result.data?.status === "partial")
    return { ok: false, error: "Some calendars couldn't be read. Try again later." };
  return { ok: true };
}

export async function setCalendarShownAction(
  calendarId: string,
  shown: boolean,
): Promise<ActionResult> {
  const id = z.string().min(1).max(300).parse(calendarId);
  const result = await run(async (ctx) => {
    const { error } = await ctx.db
      .from("calendars")
      .update({ selected: shown })
      .eq("google_calendar_id", id)
      .eq("is_ward", false);
    if (error) throw new Error(error.code);
    const admin = createAdminClient();
    if (shown) await syncUser(admin, ctx.userId);
    else
      await admin
        .from("calendar_events")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("google_calendar_id", id);
  });
  return result.ok ? { ok: true } : result;
}

export async function disconnectGoogleAction(removeWardCalendar: boolean): Promise<ActionResult> {
  const result = await run((ctx) =>
    disconnect(createAdminClient(), ctx.userId, { removeWardCalendar }),
  );
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}
