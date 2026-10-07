import "server-only";
import { addDays, logicalDay, logicalInstant, type IsoDate } from "@/domain/day";
import { isScheduledOn } from "@/domain/habits";
import { isolate } from "@/domain/text";
import type { AdminClient } from "@/server/supabase/admin";
import { blockTitleFromEvent } from "./mapping";
import {
  CalendarError,
  eventIdForBlock,
  type CalendarProvider,
  type EventInput,
  type GEvent,
} from "./provider";

/**
 * Two-way sync for blocks in the app-created "W.A.R.D." calendar.
 *
 * - Local changes are marked sync_state = 'pending' (with changed_at) by the
 *   app and pushed here. Inserts use the block id as event id, so a retried
 *   insert can never create a duplicate (409 = already there).
 * - Changes made in Google are detected by etag and applied locally.
 * - If both sides changed, the newer change wins (changed_at vs Google's
 *   `updated`); a deletion in Google always wins.
 */

export type BlockSyncArgs = {
  admin: AdminClient;
  provider: CalendarProvider;
  token: string;
  userId: string;
  calendarId: string;
  window: { from: Date; to: Date; today: IsoDate };
  timeZone: string;
  rollover: string;
  reminders: boolean;
  now: Date;
};

type BlockRow = {
  id: string;
  kind: string;
  title: string;
  starts_at: string;
  ends_at: string;
  google_calendar_id: string | null;
  google_event_id: string | null;
  google_etag: string | null;
  sync_state: string;
  deleted_at: string | null;
  changed_at: string;
};

const BLOCK_COLUMNS =
  "id, kind, title, starts_at, ends_at, google_calendar_id, google_event_id, google_etag, sync_state, deleted_at, changed_at";

const FOCUS_PREFIX = "Focus · ";

export function summaryFor(kind: string, title: string): string {
  return kind === "focus" ? `${FOCUS_PREFIX}${isolate(title)}` : isolate(title);
}

export function titleFromSummary(kind: string, event: GEvent): string | null {
  const plain = blockTitleFromEvent(event);
  if (!plain) return null;
  return kind === "focus" && plain.startsWith(FOCUS_PREFIX)
    ? plain.slice(FOCUS_PREFIX.length)
    : plain;
}

function eventInput(block: BlockRow, timeZone: string, reminders: boolean): EventInput {
  return {
    summary: summaryFor(block.kind, block.title),
    start: { dateTime: new Date(block.starts_at).toISOString(), timeZone },
    end: { dateTime: new Date(block.ends_at).toISOString(), timeZone },
    transparency: "opaque",
    extendedProperties: { private: { ward_block_id: block.id, ward_kind: block.kind } },
    reminders: reminders
      ? { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] }
      : { useDefault: false, overrides: [] },
  };
}

async function markSynced(
  args: BlockSyncArgs,
  block: BlockRow,
  event: GEvent | null,
  calendarId: string | null,
) {
  // Only if nothing changed locally meanwhile; otherwise it stays pending.
  await args.admin
    .from("calendar_blocks")
    .update({
      sync_state: "synced",
      sync_error: null,
      google_calendar_id: calendarId,
      google_event_id: event?.id ?? block.google_event_id,
      google_etag: event?.etag ?? block.google_etag,
      google_updated_at: event?.updated ?? null,
    })
    .eq("id", block.id)
    .eq("user_id", args.userId)
    .eq("changed_at", block.changed_at);
}

/** Applies the Google version of an event to a block (Google side won). */
async function applyRemote(args: BlockSyncArgs, block: BlockRow, event: GEvent) {
  if (event.status === "cancelled") {
    await args.admin
      .from("calendar_blocks")
      .update({
        deleted_at: args.now.toISOString(),
        sync_state: "synced",
        sync_error: null,
        google_etag: event.etag ?? null,
        google_updated_at: event.updated ?? null,
      })
      .eq("id", block.id)
      .eq("user_id", args.userId);
    return;
  }
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start || !end) return; // turned into an all-day event: leave the block as it was
  const startsAt = new Date(start);
  let endsAt = new Date(end);
  // Keep the 4-hour cap; a longer event is clamped rather than rejected.
  if (endsAt.getTime() - startsAt.getTime() > 4 * 3_600_000)
    endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);
  if (endsAt <= startsAt) return;
  await args.admin
    .from("calendar_blocks")
    .update({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      day: logicalDay(startsAt, args.timeZone, args.rollover),
      title: titleFromSummary(block.kind, event)?.slice(0, 200) || block.title,
      sync_state: "synced",
      sync_error: null,
      google_calendar_id: args.calendarId,
      google_event_id: event.id,
      google_etag: event.etag ?? null,
      google_updated_at: event.updated ?? null,
    })
    .eq("id", block.id)
    .eq("user_id", args.userId);
}

/** Pushes pending local changes. Returns [pushed, conflicts]. */
export async function pushPending(args: BlockSyncArgs): Promise<[number, number]> {
  const { admin, provider, token, userId } = args;
  const since = new Date(args.now.getTime() - 7 * 86_400_000).toISOString();
  const { data } = await admin
    .from("calendar_blocks")
    .select(BLOCK_COLUMNS)
    .eq("user_id", userId)
    .in("sync_state", ["pending", "error"])
    .gt("ends_at", since)
    .order("starts_at")
    .limit(100);
  let pushed = 0;
  let conflicts = 0;

  for (const block of (data ?? []) as BlockRow[]) {
    const calendarId = block.google_calendar_id ?? args.calendarId;
    const eventId = block.google_event_id ?? eventIdForBlock(block.id);
    try {
      if (block.deleted_at) {
        if (block.google_calendar_id)
          await provider.deleteEvent(token, block.google_calendar_id, eventId);
        await markSynced(args, block, null, block.google_calendar_id);
        pushed++;
        continue;
      }
      const input = eventInput(block, args.timeZone, args.reminders);
      if (!block.google_etag || block.google_calendar_id !== calendarId) {
        let event: GEvent;
        try {
          event = await provider.insertEvent(token, calendarId, { ...input, id: eventId });
        } catch (e) {
          if (!(e instanceof CalendarError && e.code === "conflict")) throw e;
          // Already there (an earlier insert succeeded, or it was deleted in Google): restore it.
          event = await provider.patchEvent(token, calendarId, eventId, {
            ...input,
            status: "confirmed",
          });
        }
        await markSynced(args, block, event, calendarId);
        pushed++;
        continue;
      }
      try {
        const event = await provider.patchEvent(
          token,
          calendarId,
          eventId,
          { ...input, status: "confirmed" },
          block.google_etag,
        );
        await markSynced(args, block, event, calendarId);
        pushed++;
      } catch (e) {
        if (!(e instanceof CalendarError)) throw e;
        if (e.code === "precondition") {
          // Changed in Google too: the newer change wins.
          conflicts++;
          const remote = await provider.getEvent(token, calendarId, eventId);
          if (!remote || remote.status === "cancelled") {
            if (remote) await applyRemote(args, block, remote);
            else await applyRemote(args, block, { id: eventId, status: "cancelled" });
            continue;
          }
          if (Date.parse(block.changed_at) > Date.parse(remote.updated ?? "0")) {
            const event = await provider.patchEvent(token, calendarId, eventId, {
              ...input,
              status: "confirmed",
            });
            await markSynced(args, block, event, calendarId);
            pushed++;
          } else {
            await applyRemote(args, block, remote);
          }
        } else if (e.code === "not_found" || e.code === "gone") {
          // Deleted in Google: deletion wins.
          conflicts++;
          await applyRemote(args, block, { id: eventId, status: "cancelled" });
        } else {
          throw e;
        }
      }
    } catch (e) {
      const code = e instanceof CalendarError ? e.code : "other";
      await admin
        .from("calendar_blocks")
        .update({ sync_state: "error", sync_error: code })
        .eq("id", block.id)
        .eq("user_id", userId)
        .eq("changed_at", block.changed_at);
      if (code === "auth" || code === "rate_limit") throw e;
    }
  }
  return [pushed, conflicts];
}

/** Applies changes made in Google to the W.A.R.D. calendar. Returns [pulled, conflicts]. */
export async function pullRemote(args: BlockSyncArgs): Promise<[number, number]> {
  const { admin, provider, token, userId, calendarId, window } = args;
  const events = await provider.listEvents(token, calendarId, {
    timeMin: window.from,
    timeMax: window.to,
    showDeleted: true,
  });
  const { data } = await admin
    .from("calendar_blocks")
    .select(BLOCK_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("google_calendar_id", calendarId)
    .lt("starts_at", window.to.toISOString())
    .gt("ends_at", window.from.toISOString());
  const blocks = (data ?? []) as BlockRow[];
  const byEvent = new Map(blocks.map((b) => [b.google_event_id ?? eventIdForBlock(b.id), b]));
  const seen = new Set<string>();
  let pulled = 0;
  let conflicts = 0;

  for (const event of events) {
    seen.add(event.id);
    const block = byEvent.get(event.id);
    if (!block) {
      if (event.status === "cancelled" || !event.start?.dateTime || !event.end?.dateTime) continue;
      // Known to W.A.R.D. at all (e.g. a tombstone)? Then don't import it again.
      const { data: known } = await admin
        .from("calendar_blocks")
        .select("id")
        .eq("user_id", userId)
        .eq("google_event_id", event.id)
        .maybeSingle();
      if (known) continue;
      // Created directly in the W.A.R.D. calendar: import as an untagged focus block.
      const startsAt = new Date(event.start.dateTime);
      let endsAt = new Date(event.end.dateTime);
      if (endsAt.getTime() - startsAt.getTime() > 4 * 3_600_000)
        endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);
      if (endsAt <= startsAt) continue;
      await admin.from("calendar_blocks").insert({
        user_id: userId,
        kind: "focus",
        title: (titleFromSummary("focus", event) ?? "Focus").slice(0, 200),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        day: logicalDay(startsAt, args.timeZone, args.rollover),
        google_calendar_id: calendarId,
        google_event_id: event.id,
        google_etag: event.etag ?? null,
        google_updated_at: event.updated ?? null,
        sync_state: "synced",
      });
      pulled++;
      continue;
    }
    if (event.etag && event.etag === block.google_etag) continue; // unchanged in Google
    if (block.sync_state !== "synced") {
      conflicts++;
      // Local change still pending (its push failed): newer wins, deletion in Google always wins.
      if (
        event.status !== "cancelled" &&
        Date.parse(block.changed_at) > Date.parse(event.updated ?? "0")
      )
        continue;
    }
    await applyRemote(args, block, event);
    pulled++;
  }

  // Blocks we expected in the window but Google didn't return: moved far away or gone.
  for (const block of blocks) {
    const eventId = block.google_event_id ?? eventIdForBlock(block.id);
    if (seen.has(eventId) || !block.google_etag) continue;
    const remote = await provider.getEvent(token, calendarId, eventId);
    await applyRemote(args, block, remote ?? { id: eventId, status: "cancelled" });
    pulled++;
  }
  return [pulled, conflicts];
}

/**
 * Creates habit blocks for the coming week (daily and chosen-days habits with
 * a time and a block length). A tombstone for a day means the user deleted
 * that block; it is not re-created.
 */
export async function materializeHabitBlocks(args: BlockSyncArgs): Promise<number> {
  const { admin, userId, window } = args;
  const { data: habits } = await admin
    .from("habits")
    .select(
      "id, name, goal_id, schedule_kind, schedule_days, per_week, target_time, block_min, starts_on",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .not("block_min", "is", null)
    .not("target_time", "is", null)
    .neq("schedule_kind", "per_week");
  const rows = [];
  for (const h of habits ?? []) {
    const rule = {
      scheduleKind: h.schedule_kind as "daily" | "days",
      scheduleDays: h.schedule_days,
      perWeek: h.per_week,
      graceAllowed: 1,
      graceWindow: 7,
      startsOn: h.starts_on,
    };
    for (let i = 0; i < 7; i++) {
      const day = addDays(window.today, i);
      if (!isScheduledOn(rule, day)) continue;
      const start = logicalInstant(day, h.target_time!, args.timeZone, args.rollover);
      if (start <= args.now) continue;
      const end = new Date(start.getTime() + h.block_min! * 60_000);
      const id = crypto.randomUUID();
      rows.push({
        id,
        user_id: userId,
        kind: "habit",
        habit_id: h.id,
        goal_id: h.goal_id,
        title: h.name,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        day,
        google_event_id: eventIdForBlock(id),
        sync_state: "pending",
      });
    }
  }
  if (!rows.length) return 0;
  const { data } = await admin
    .from("calendar_blocks")
    .upsert(rows, { onConflict: "habit_id,day", ignoreDuplicates: true })
    .select("id");
  return data?.length ?? 0;
}

export async function syncWardBlocks(args: BlockSyncArgs) {
  await materializeHabitBlocks(args);
  const [pushed, pushConflicts] = await pushPending(args);
  const [pulled, pullConflicts] = await pullRemote(args);
  return { pushed, pulled, conflicts: pushConflicts + pullConflicts };
}
