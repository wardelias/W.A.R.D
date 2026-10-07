import "server-only";
import { addDays, compareDates, startOfWeek, type IsoDate } from "@/domain/day";
import {
  computeStreak,
  defaultGraceWindow,
  habitStats,
  isScheduledOn,
  type HabitRule,
  type HabitStats,
  type LogLevel,
  type StreakResult,
} from "@/domain/habits";
import { check, ServiceError, type Ctx } from "@/server/context";
import {
  habitInput,
  logHabitInput,
  unlogHabitInput,
  updateHabitInput,
  type HabitInput,
} from "@/server/validation/habits";
import { parse } from "@/server/validation/parse";
import type { z } from "zod";

/** How far back streaks and stats look (keeps queries bounded). */
const HISTORY_DAYS = 400;

export type Habit = {
  id: string;
  name: string;
  minimumVersion: string;
  scheduleKind: "daily" | "days" | "per_week";
  scheduleDays: number[] | null;
  perWeek: number | null;
  targetTime: string | null;
  blockMin: number | null;
  graceAllowed: number;
  graceWindow: number;
  startsOn: IsoDate;
  archivedAt: string | null;
  goal: { id: string; rank: number; label: string };
};

export type HabitSummary = {
  habit: Habit;
  scheduledToday: boolean;
  todayLevel: LogLevel | null;
  streak: StreakResult;
  stats: HabitStats;
  /** per_week habits: logs so far this week. */
  thisWeek: number | null;
};

const HABIT_COLUMNS =
  "id, name, minimum_version, schedule_kind, schedule_days, per_week, target_time, block_min, grace_allowed, grace_window, starts_on, archived_at, goal:goals!habits_goal_fk(id, rank, label)";

type HabitRow = {
  id: string;
  name: string;
  minimum_version: string;
  schedule_kind: string;
  schedule_days: number[] | null;
  per_week: number | null;
  target_time: string | null;
  block_min: number | null;
  grace_allowed: number;
  grace_window: number;
  starts_on: string;
  archived_at: string | null;
  goal: { id: string; rank: number; label: string } | null;
};

function toHabit(row: HabitRow): Habit {
  if (!row.goal) throw new Error("Habit without goal");
  return {
    id: row.id,
    name: row.name,
    minimumVersion: row.minimum_version,
    scheduleKind: row.schedule_kind as Habit["scheduleKind"],
    scheduleDays: row.schedule_days,
    perWeek: row.per_week,
    targetTime: row.target_time ? row.target_time.slice(0, 5) : null,
    blockMin: row.block_min,
    graceAllowed: row.grace_allowed,
    graceWindow: row.grace_window,
    startsOn: row.starts_on,
    archivedAt: row.archived_at,
    goal: row.goal,
  };
}

export function ruleOf(habit: Habit, today: IsoDate): HabitRule {
  const floor = addDays(today, -HISTORY_DAYS);
  return {
    scheduleKind: habit.scheduleKind,
    scheduleDays: habit.scheduleDays,
    perWeek: habit.perWeek,
    graceAllowed: habit.graceAllowed,
    graceWindow: habit.graceWindow,
    startsOn: compareDates(habit.startsOn, floor) < 0 ? floor : habit.startsOn,
  };
}

function toRow(v: z.output<typeof habitInput>) {
  return {
    name: v.name,
    minimum_version: v.minimumVersion,
    goal_id: v.goalId,
    schedule_kind: v.scheduleKind,
    schedule_days: v.scheduleKind === "days" ? v.scheduleDays : null,
    per_week: v.scheduleKind === "per_week" ? v.perWeek : null,
    target_time: v.targetTime,
    block_min: v.targetTime ? v.blockMin : null,
    grace_allowed: v.strict ? 0 : 1,
    grace_window: defaultGraceWindow(v.scheduleKind),
  };
}

export async function listHabits(ctx: Ctx, { archived = false } = {}): Promise<Habit[]> {
  let query = ctx.db.from("habits").select(HABIT_COLUMNS);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const rows = check(await query.order("position").order("created_at"), "load your habits");
  return ((rows ?? []) as unknown as HabitRow[]).map(toHabit);
}

export async function getHabit(ctx: Ctx, id: string): Promise<Habit | null> {
  const row = check(
    await ctx.db.from("habits").select(HABIT_COLUMNS).eq("id", id).maybeSingle(),
    "load the habit",
  ) as unknown as HabitRow | null;
  return row ? toHabit(row) : null;
}

export async function createHabit(ctx: Ctx, input: HabitInput): Promise<Habit> {
  const v = parse(habitInput, input);
  const row = check(
    await ctx.db
      .from("habits")
      .insert({ ...toRow(v), starts_on: ctx.today })
      .select(HABIT_COLUMNS)
      .single(),
    "save the habit",
  ) as unknown as HabitRow;
  return toHabit(row);
}

export async function updateHabit(
  ctx: Ctx,
  input: z.input<typeof updateHabitInput>,
): Promise<Habit> {
  const v = parse(updateHabitInput, input);
  const row = check(
    await ctx.db.from("habits").update(toRow(v)).eq("id", v.id).select(HABIT_COLUMNS).maybeSingle(),
    "save the habit",
  ) as unknown as HabitRow | null;
  if (!row) throw new ServiceError("That habit no longer exists.");
  return toHabit(row);
}

/** Archive instead of delete: history stays honest and can be restored. */
export async function setHabitArchived(ctx: Ctx, id: string, archived: boolean): Promise<void> {
  check(
    await ctx.db
      .from("habits")
      .update({ archived_at: archived ? ctx.now.toISOString() : null })
      .eq("id", id),
    archived ? "archive the habit" : "restore the habit",
  );
}

function allowedDay(ctx: Ctx, day: IsoDate | undefined): IsoDate {
  const d = day ?? ctx.today;
  if (d !== ctx.today && d !== addDays(ctx.today, -1)) {
    throw new ServiceError("You can log today or fix yesterday.");
  }
  return d;
}

export async function logHabit(ctx: Ctx, input: z.input<typeof logHabitInput>): Promise<void> {
  const v = parse(logHabitInput, input);
  const day = allowedDay(ctx, v.day);
  const habit = await getHabit(ctx, v.habitId);
  if (!habit || habit.archivedAt) throw new ServiceError("That habit isn't active.");
  if (compareDates(day, habit.startsOn) < 0) throw new ServiceError("The habit starts later.");
  check(
    await ctx.db
      .from("habit_logs")
      .upsert(
        { habit_id: v.habitId, day, level: v.level, logged_at: ctx.now.toISOString() },
        { onConflict: "habit_id,day" },
      ),
    "log the habit",
  );
}

export async function unlogHabit(ctx: Ctx, input: z.input<typeof unlogHabitInput>): Promise<void> {
  const v = parse(unlogHabitInput, input);
  const day = allowedDay(ctx, v.day);
  check(
    await ctx.db.from("habit_logs").delete().eq("habit_id", v.habitId).eq("day", day),
    "undo the log",
  );
}

/** Logs per habit since the history floor. */
export async function logsByHabit(
  ctx: Ctx,
  habitIds: string[],
): Promise<Map<string, Map<IsoDate, LogLevel>>> {
  const out = new Map<string, Map<IsoDate, LogLevel>>(habitIds.map((id) => [id, new Map()]));
  if (habitIds.length === 0) return out;
  const rows = check(
    await ctx.db
      .from("habit_logs")
      .select("habit_id, day, level")
      .in("habit_id", habitIds)
      .gte("day", addDays(ctx.today, -HISTORY_DAYS))
      .lte("day", ctx.today),
    "load habit history",
  );
  for (const r of rows ?? []) out.get(r.habit_id)?.set(r.day, r.level as LogLevel);
  return out;
}

export function summarizeHabit(
  habit: Habit,
  logs: Map<IsoDate, LogLevel>,
  today: IsoDate,
  weekStart: number,
): HabitSummary {
  const rule = ruleOf(habit, today);
  const streak = computeStreak(rule, logs, today, weekStart);
  let thisWeek: number | null = null;
  if (habit.scheduleKind === "per_week") {
    const from = startOfWeek(today, weekStart);
    thisWeek = [...logs.keys()].filter(
      (d) => compareDates(d, from) >= 0 && compareDates(d, today) <= 0,
    ).length;
  }
  return {
    habit,
    scheduledToday: isScheduledOn(rule, today),
    todayLevel: logs.get(today) ?? null,
    streak,
    stats: habitStats(rule, logs, today, weekStart),
    thisWeek,
  };
}

/** Active habits with today's status, streak and stats. */
export async function habitSummaries(ctx: Ctx): Promise<HabitSummary[]> {
  const habits = await listHabits(ctx);
  const logs = await logsByHabit(
    ctx,
    habits.map((h) => h.id),
  );
  return habits.map((h) =>
    summarizeHabit(h, logs.get(h.id) ?? new Map(), ctx.today, ctx.settings.week_start),
  );
}
