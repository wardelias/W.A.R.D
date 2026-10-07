import "server-only";
import { addDays, compareDates, minutesBetween, type IsoDate } from "@/domain/day";
import { check, ServiceError, type Ctx } from "@/server/context";
import { habitSummaries } from "@/server/services/habits";
import { setOneThing } from "@/server/services/plans";
import { createTask, getTask, planTask, setTaskStatus, tasksForDay } from "@/server/services/tasks";
import { closeDayInput, type CloseDayInput } from "@/server/validation/checkin";
import { parse } from "@/server/validation/parse";

/** Snapshot stored with each daily review (feeds the Phase 2 weekly review). */
export type DailyStats = {
  tasks: { planned: number; done: number; moved: number; dropped: number };
  focus: { blocks: number; plannedMin: number; doneMin: number; skipped: number };
  habits: { scheduled: number; full: number; minimum: number; missed: number };
  firstTaskTomorrow: string | null;
};

export type DailyReview = {
  day: IsoDate;
  note: string | null;
  stats: DailyStats;
  completedAt: string;
};

export async function getDailyReview(ctx: Ctx, day: IsoDate): Promise<DailyReview | null> {
  const row = check(
    await ctx.db
      .from("reviews")
      .select("period_start, note, stats, completed_at")
      .eq("kind", "daily")
      .eq("period_start", day)
      .maybeSingle(),
    "load the check-in",
  );
  if (!row) return null;
  return {
    day: row.period_start,
    note: row.note,
    stats: row.stats as unknown as DailyStats,
    completedAt: row.completed_at,
  };
}

export type FocusBlockSummary = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  outcome: "done" | "partial" | "skipped" | null;
};

export async function focusBlocksForDay(ctx: Ctx, day: IsoDate): Promise<FocusBlockSummary[]> {
  const rows = check(
    await ctx.db
      .from("calendar_blocks")
      .select("id, title, starts_at, ends_at, outcome")
      .eq("kind", "focus")
      .eq("day", day)
      .is("deleted_at", null)
      .order("starts_at"),
    "load focus blocks",
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    outcome: r.outcome as FocusBlockSummary["outcome"],
  }));
}

/**
 * Closes a day: applies task decisions (moving an unfinished task counts as
 * a slip), records focus-block outcomes, sets tomorrow's first task, and
 * stores a review with an honest stats snapshot. Running it again updates
 * the same review.
 */
export async function closeDay(ctx: Ctx, input: CloseDayInput): Promise<DailyReview> {
  const v = parse(closeDayInput, input);
  if (v.day !== ctx.today) throw new ServiceError("You can only close today.");
  const tomorrow = addDays(v.day, 1);

  const dayTasks = await tasksForDay(ctx, v.day);
  const ids = new Set(dayTasks.map((t) => t.id));
  let moved = 0;
  let dropped = 0;
  for (const d of v.tasks) {
    if (!ids.has(d.id))
      throw new ServiceError("A task changed while you were checking in. Reload.");
    if (d.action === "done") await setTaskStatus(ctx, { id: d.id, status: "done" });
    if (d.action === "drop") {
      await setTaskStatus(ctx, { id: d.id, status: "dropped" });
      dropped++;
    }
    if (d.action === "move") {
      if (compareDates(d.toDay, v.day) <= 0) throw new ServiceError("Move tasks to a later day.");
      await planTask(ctx, { id: d.id, day: d.toDay, slipped: true });
      moved++;
    }
  }

  const blocks = await focusBlocksForDay(ctx, v.day);
  const blockIds = new Set(blocks.map((b) => b.id));
  for (const b of v.blocks) {
    if (!blockIds.has(b.id)) continue;
    check(
      await ctx.db.from("calendar_blocks").update({ outcome: b.outcome }).eq("id", b.id),
      "save focus blocks",
    );
  }

  let firstTaskTitle: string | null = null;
  if (v.firstTask?.kind === "new") {
    const task = await createTask(ctx, {
      title: v.firstTask.title,
      goalId: v.firstTask.goalId,
      plannedFor: tomorrow,
      estMin: null,
      dueOn: null,
      notes: null,
    });
    await setOneThing(ctx, { day: tomorrow, taskId: task.id });
    firstTaskTitle = task.title;
  } else if (v.firstTask?.kind === "existing") {
    await setOneThing(ctx, { day: tomorrow, taskId: v.firstTask.taskId });
    firstTaskTitle = (await getTask(ctx, v.firstTask.taskId))?.title ?? null;
  }

  const after = await tasksForDay(ctx, v.day);
  const blocksAfter = await focusBlocksForDay(ctx, v.day);
  const habits = (await habitSummaries(ctx)).filter((h) => h.scheduledToday);
  const minutes = (b: FocusBlockSummary) =>
    minutesBetween(new Date(b.startsAt), new Date(b.endsAt));
  const stats: DailyStats = {
    tasks: {
      planned: dayTasks.length,
      done: after.filter((t) => t.status === "done").length,
      moved,
      dropped,
    },
    focus: {
      blocks: blocksAfter.length,
      plannedMin: blocksAfter.reduce((s, b) => s + minutes(b), 0),
      doneMin: blocksAfter.reduce(
        (s, b) =>
          s + (b.outcome === "done" ? minutes(b) : b.outcome === "partial" ? minutes(b) / 2 : 0),
        0,
      ),
      skipped: blocksAfter.filter((b) => b.outcome === "skipped").length,
    },
    habits: {
      scheduled: habits.length,
      full: habits.filter((h) => h.todayLevel === "full").length,
      minimum: habits.filter((h) => h.todayLevel === "minimum").length,
      missed: habits.filter((h) => !h.todayLevel).length,
    },
    firstTaskTomorrow: firstTaskTitle,
  };

  const row = check(
    await ctx.db
      .from("reviews")
      .upsert(
        {
          user_id: ctx.userId,
          kind: "daily",
          period_start: v.day,
          period_end: v.day,
          note: v.note,
          stats,
          completed_at: ctx.now.toISOString(),
        },
        { onConflict: "user_id,kind,period_start" },
      )
      .select("period_start, note, stats, completed_at")
      .single(),
    "save the check-in",
  );
  return {
    day: row!.period_start,
    note: row!.note,
    stats: row!.stats as unknown as DailyStats,
    completedAt: row!.completed_at,
  };
}
