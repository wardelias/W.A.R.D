import "server-only";
import { z } from "zod";
import { dayBounds, localTime, logicalDay, logicalInstant, type IsoDate } from "@/domain/day";
import { nextSlots, type Interval } from "@/domain/slots";
import { check, ServiceError, type Ctx } from "@/server/context";
import {
  accessToken,
  calendarProvider,
  getConnection,
  NeedsReconnect,
} from "@/server/google/accounts";
import { materializeHabitBlocks, pushPending } from "@/server/google/blocks-sync";
import { eventIdForBlock } from "@/server/google/provider";
import { syncWindow } from "@/server/google/sync";
import { createAdminClient } from "@/server/supabase/admin";
import { getTask } from "@/server/services/tasks";
import { isoDate, uuid } from "@/server/validation/common";
import { parse } from "@/server/validation/parse";

/**
 * Focus and habit blocks. Every change is saved first (sync_state =
 * 'pending', changed_at = now) and then pushed to Google right away; if the
 * push fails the block stays pending and the next sync retries.
 */

export type Block = {
  id: string;
  kind: "focus" | "habit";
  title: string;
  startsAt: Date;
  endsAt: Date;
  day: IsoDate;
  taskId: string | null;
  habitId: string | null;
  goalId: string | null;
  outcome: "done" | "partial" | "skipped" | null;
  syncState: "synced" | "pending" | "error";
};

const COLUMNS =
  "id, kind, title, starts_at, ends_at, day, task_id, habit_id, goal_id, outcome, sync_state";

type Row = {
  id: string;
  kind: string;
  title: string;
  starts_at: string;
  ends_at: string;
  day: string;
  task_id: string | null;
  habit_id: string | null;
  goal_id: string | null;
  outcome: string | null;
  sync_state: string;
};

function toBlock(r: Row): Block {
  return {
    id: r.id,
    kind: r.kind as Block["kind"],
    title: r.title,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    day: r.day,
    taskId: r.task_id,
    habitId: r.habit_id,
    goalId: r.goal_id,
    outcome: r.outcome as Block["outcome"],
    syncState: r.sync_state as Block["syncState"],
  };
}

/** Pushes pending blocks to Google now. Never throws: a failure leaves them pending. */
export async function pushNow(ctx: Ctx): Promise<void> {
  try {
    const admin = createAdminClient();
    const connection = await getConnection(admin, ctx.userId);
    if (!connection?.wardCalendarId || connection.status !== "active") return;
    const token = await accessToken(admin, ctx.userId);
    await pushPending({
      admin,
      provider: calendarProvider(),
      token,
      userId: ctx.userId,
      calendarId: connection.wardCalendarId,
      window: syncWindow(ctx.now, ctx.settings.timezone, ctx.settings.day_rollover),
      timeZone: ctx.settings.timezone,
      rollover: ctx.settings.day_rollover,
      reminders: ctx.settings.block_reminders,
      now: ctx.now,
    });
  } catch (e) {
    if (!(e instanceof NeedsReconnect)) console.error("[blocks] push failed", (e as Error).name);
  }
}

export async function getBlock(ctx: Ctx, id: string): Promise<Block | null> {
  const row = check(
    await ctx.db
      .from("calendar_blocks")
      .select(COLUMNS)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    "load the block",
  );
  return row ? toBlock(row as Row) : null;
}

/** Busy time on a day: outside events marked busy (selected calendars) and habit blocks; plus focus blocks. */
export async function busyOn(ctx: Ctx, day: IsoDate, exceptBlockId?: string) {
  const { start, end } = dayBounds(day, ctx.settings.timezone, ctx.settings.day_rollover);
  const [events, blocks, calendars] = await Promise.all([
    ctx.db
      .from("calendar_events")
      .select("google_calendar_id, starts_at, ends_at")
      .eq("all_day", false)
      .eq("busy", true)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
    ctx.db
      .from("calendar_blocks")
      .select("id, kind, starts_at, ends_at, outcome")
      .is("deleted_at", null)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
    ctx.db.from("calendars").select("google_calendar_id").eq("selected", true),
  ]);
  const shown = new Set(
    (check(calendars, "load calendars") ?? []).map((c) => c.google_calendar_id),
  );
  const busy: Interval[] = (check(events, "load events") ?? [])
    .filter((e) => shown.has(e.google_calendar_id))
    .map((e) => ({ start: new Date(e.starts_at!), end: new Date(e.ends_at!) }));
  const focus: Interval[] = [];
  for (const b of check(blocks, "load blocks") ?? []) {
    if (b.id === exceptBlockId || b.outcome === "skipped") continue;
    const interval = { start: new Date(b.starts_at), end: new Date(b.ends_at) };
    (b.kind === "focus" ? focus : busy).push(interval);
  }
  return { busy, focus };
}

const suggestInput = z.object({
  day: isoDate,
  count: z.number().int().min(1).max(6),
  notBefore: z.date().optional(),
  minutes: z.number().int().min(15).max(180).optional(),
});

/** Next free focus slots on a day (45/15 by default), never in the past. */
export async function suggestFocusSlots(
  ctx: Ctx,
  input: z.input<typeof suggestInput>,
): Promise<Interval[]> {
  const v = parse(suggestInput, input);
  const { busy, focus } = await busyOn(ctx, v.day);
  return nextSlots(
    {
      day: v.day,
      now: ctx.now,
      timeZone: ctx.settings.timezone,
      rollover: ctx.settings.day_rollover,
      windows: ctx.settings.focus_windows,
      busy,
      focusBlocks: focus,
      blockMin: v.minutes ?? ctx.settings.focus_block_min,
      breakMin: ctx.settings.break_min,
      notBefore: v.notBefore,
    },
    v.count,
  );
}

const createInput = z.object({
  taskId: uuid.nullable(),
  goalId: uuid.nullable(),
  starts: z
    .array(z.iso.datetime({ offset: true }))
    .min(1)
    .max(6),
  minutes: z.number().int().min(15).max(180),
});

export async function createFocusBlocks(
  ctx: Ctx,
  input: z.input<typeof createInput>,
): Promise<Block[]> {
  const v = parse(createInput, input);
  const task = v.taskId ? await getTask(ctx, v.taskId) : null;
  if (v.taskId && !task) throw new ServiceError("That task no longer exists.");
  const goalId = task?.goal.id ?? v.goalId;
  const title = task?.title ?? "Focus";
  const earliest = ctx.now.getTime() - 5 * 60_000;
  const rows = v.starts.map((s) => {
    const start = new Date(s);
    if (start.getTime() < earliest) throw new ServiceError("Blocks can't start in the past.");
    const id = crypto.randomUUID();
    return {
      id,
      kind: "focus",
      task_id: task?.id ?? null,
      goal_id: goalId,
      title,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + v.minutes * 60_000).toISOString(),
      day: logicalDay(start, ctx.settings.timezone, ctx.settings.day_rollover),
      google_event_id: eventIdForBlock(id),
      sync_state: "pending",
      changed_at: ctx.now.toISOString(),
    };
  });
  const data = check(
    await ctx.db.from("calendar_blocks").insert(rows).select(COLUMNS),
    "add the focus blocks",
  );
  await pushNow(ctx);
  return (data ?? []).map((r) => toBlock(r as Row));
}

const moveInput = z.object({ id: uuid, start: z.iso.datetime({ offset: true }) });

export async function moveBlock(ctx: Ctx, input: z.input<typeof moveInput>): Promise<Block> {
  const v = parse(moveInput, input);
  const block = await getBlock(ctx, v.id);
  if (!block) throw new ServiceError("That block no longer exists.");
  const start = new Date(v.start);
  const end = new Date(start.getTime() + (block.endsAt.getTime() - block.startsAt.getTime()));
  const row = check(
    await ctx.db
      .from("calendar_blocks")
      .update({
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        day: logicalDay(start, ctx.settings.timezone, ctx.settings.day_rollover),
        outcome: null,
        sync_state: "pending",
        changed_at: ctx.now.toISOString(),
      })
      .eq("id", v.id)
      .select(COLUMNS)
      .single(),
    "move the block",
  );
  await pushNow(ctx);
  return toBlock(row as Row);
}

/** Removes a block (tombstone, so a habit block isn't re-created for that day). */
export async function deleteBlock(ctx: Ctx, id: string): Promise<void> {
  parse(uuid, id);
  check(
    await ctx.db
      .from("calendar_blocks")
      .update({
        deleted_at: ctx.now.toISOString(),
        sync_state: "pending",
        changed_at: ctx.now.toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null),
    "remove the block",
  );
  await pushNow(ctx);
}

export async function setBlockOutcome(
  ctx: Ctx,
  id: string,
  outcome: "done" | "partial" | "skipped" | null,
): Promise<void> {
  parse(uuid, id);
  check(await ctx.db.from("calendar_blocks").update({ outcome }).eq("id", id), "save the block");
}

/**
 * Moves a block to another day for an overload fix: same time of day if
 * that's free, otherwise the first free focus slot that day.
 */
export async function moveBlockToDay(ctx: Ctx, id: string, day: IsoDate): Promise<void> {
  const block = await getBlock(ctx, id);
  if (!block) return;
  const minutes = Math.round((block.endsAt.getTime() - block.startsAt.getTime()) / 60_000);
  const sameTime = logicalInstant(
    day,
    localTime(block.startsAt, ctx.settings.timezone),
    ctx.settings.timezone,
    ctx.settings.day_rollover,
  );
  const { busy, focus } = await busyOn(ctx, day, id);
  const base = {
    day,
    now: ctx.now,
    timeZone: ctx.settings.timezone,
    rollover: ctx.settings.day_rollover,
    windows: ctx.settings.focus_windows,
    busy,
    focusBlocks: focus,
    blockMin: minutes,
    breakMin: ctx.settings.break_min,
  };
  const exact = nextSlots({ ...base, notBefore: sameTime }, 1)[0];
  const slot =
    exact && exact.start.getTime() === sameTime.getTime()
      ? exact
      : (nextSlots(base, 1)[0] ?? { start: sameTime });
  await moveBlock(ctx, { id, start: slot.start.toISOString() });
}

/**
 * Keeps a habit's future blocks in line with the habit: new time or name,
 * removed when the block is turned off or the habit is archived, revived
 * when blocks are turned back on. The next sync creates missing days.
 */
export async function syncHabitBlocks(
  ctx: Ctx,
  habit: {
    id: string;
    name: string;
    targetTime: string | null;
    blockMin: number | null;
    archived: boolean;
  },
  { revive = false }: { revive?: boolean } = {},
): Promise<void> {
  const { data } = await ctx.db
    .from("calendar_blocks")
    .select("id, day, deleted_at")
    .eq("habit_id", habit.id)
    .gt("starts_at", ctx.now.toISOString());
  const stamp = ctx.now.toISOString();
  for (const b of data ?? []) {
    if (habit.archived || !habit.blockMin || !habit.targetTime) {
      if (!b.deleted_at) {
        await ctx.db
          .from("calendar_blocks")
          .update({ deleted_at: stamp, sync_state: "pending", changed_at: stamp })
          .eq("id", b.id);
      }
      continue;
    }
    // A deleted instance stays deleted unless blocks were just switched back on.
    if (b.deleted_at && !revive) continue;
    const start = logicalInstant(
      b.day,
      habit.targetTime,
      ctx.settings.timezone,
      ctx.settings.day_rollover,
    );
    if (start <= ctx.now) continue;
    await ctx.db
      .from("calendar_blocks")
      .update({
        title: habit.name,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + habit.blockMin * 60_000).toISOString(),
        deleted_at: null,
        sync_state: "pending",
        changed_at: stamp,
      })
      .eq("id", b.id);
  }
  await pushNow(ctx);
}

/** Creates the coming week's habit blocks now (instead of at the next sync) and pushes them. */
export async function materializeNow(ctx: Ctx): Promise<void> {
  try {
    const admin = createAdminClient();
    const connection = await getConnection(admin, ctx.userId);
    if (!connection?.wardCalendarId || connection.status !== "active") return;
    await materializeHabitBlocks({
      admin,
      provider: calendarProvider(),
      token: "",
      userId: ctx.userId,
      calendarId: connection.wardCalendarId,
      window: syncWindow(ctx.now, ctx.settings.timezone, ctx.settings.day_rollover),
      timeZone: ctx.settings.timezone,
      rollover: ctx.settings.day_rollover,
      reminders: ctx.settings.block_reminders,
      now: ctx.now,
    });
  } catch (e) {
    console.error("[blocks] habit blocks failed", (e as Error).name);
  }
  await pushNow(ctx);
}
