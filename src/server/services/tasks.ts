import "server-only";
import type { IsoDate } from "@/domain/day";
import { check, ServiceError, type Ctx } from "@/server/context";
import {
  createTaskInput,
  listTasksInput,
  planTaskInput,
  taskStatusInput,
  updateTaskInput,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/server/validation/tasks";
import { parse } from "@/server/validation/parse";
import type { z } from "zod";

/**
 * Task service. Every function validates its own input, so the same
 * functions back the UI's Server Actions now and the assistant's tools later.
 */

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  estMin: number | null;
  dueOn: IsoDate | null;
  plannedFor: IsoDate | null;
  position: number | null;
  status: "open" | "done" | "dropped";
  completedAt: string | null;
  slipCount: number;
  goal: { id: string; rank: number; label: string };
};

const TASK_COLUMNS =
  "id, title, notes, est_min, due_on, planned_for, position, status, completed_at, slip_count, goal:goals!tasks_goal_fk(id, rank, label)";

type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  est_min: number | null;
  due_on: string | null;
  planned_for: string | null;
  position: number | null;
  status: string;
  completed_at: string | null;
  slip_count: number;
  goal: { id: string; rank: number; label: string } | null;
};

function toTask(row: TaskRow): Task {
  if (!row.goal) throw new Error("Task without goal");
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    estMin: row.est_min,
    dueOn: row.due_on,
    plannedFor: row.planned_for,
    position: row.position,
    status: row.status as Task["status"],
    completedAt: row.completed_at,
    slipCount: row.slip_count,
    goal: row.goal,
  };
}

/** Sort: planned day (soonest first, unplanned last), position, then creation order. */
function byPlan(a: Task, b: Task): number {
  if (a.plannedFor !== b.plannedFor) {
    if (!a.plannedFor) return 1;
    if (!b.plannedFor) return -1;
    return a.plannedFor < b.plannedFor ? -1 : 1;
  }
  return (a.position ?? 1e9) - (b.position ?? 1e9);
}

export async function listTasks(
  ctx: Ctx,
  input: z.input<typeof listTasksInput> = {},
): Promise<Task[]> {
  const { status } = parse(listTasksInput, input);
  let query = ctx.db.from("tasks").select(TASK_COLUMNS).eq("status", status);
  query =
    status === "open"
      ? query.order("created_at")
      : query
          .order("completed_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false })
          .limit(100);
  const rows = check(await query, "load your tasks") as unknown as TaskRow[];
  const tasks = rows.map(toTask);
  return status === "open" ? tasks.sort(byPlan) : tasks;
}

/** Open tasks planned for one day, in their day order. */
export async function tasksForDay(ctx: Ctx, day: IsoDate): Promise<Task[]> {
  const rows = check(
    await ctx.db
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("planned_for", day)
      .in("status", ["open", "done"])
      .order("position", { nullsFirst: false })
      .order("created_at"),
    "load the day's tasks",
  ) as unknown as TaskRow[];
  return rows.map(toTask);
}

export async function getTask(ctx: Ctx, id: string): Promise<Task | null> {
  const row = check(
    await ctx.db.from("tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle(),
    "load the task",
  ) as unknown as TaskRow | null;
  return row ? toTask(row) : null;
}

async function nextPosition(ctx: Ctx, day: IsoDate): Promise<number> {
  const rows = check(
    await ctx.db
      .from("tasks")
      .select("position")
      .eq("planned_for", day)
      .not("position", "is", null)
      .order("position", { ascending: false })
      .limit(1),
    "plan the task",
  );
  return (rows?.[0]?.position ?? 0) + 1;
}

export async function createTask(ctx: Ctx, input: CreateTaskInput): Promise<Task> {
  const v = parse(createTaskInput, input);
  const position = v.plannedFor ? await nextPosition(ctx, v.plannedFor) : null;
  const row = check(
    await ctx.db
      .from("tasks")
      .insert({
        title: v.title,
        goal_id: v.goalId,
        est_min: v.estMin,
        planned_for: v.plannedFor,
        position,
        due_on: v.dueOn,
        notes: v.notes,
      })
      .select(TASK_COLUMNS)
      .single(),
    "save the task",
  ) as unknown as TaskRow;
  return toTask(row);
}

export async function updateTask(ctx: Ctx, input: UpdateTaskInput): Promise<Task> {
  const v = parse(updateTaskInput, input);
  const current = await getTask(ctx, v.id);
  if (!current) throw new ServiceError("That task no longer exists.");
  const position =
    v.plannedFor === current.plannedFor
      ? current.position
      : v.plannedFor
        ? await nextPosition(ctx, v.plannedFor)
        : null;
  const row = check(
    await ctx.db
      .from("tasks")
      .update({
        title: v.title,
        goal_id: v.goalId,
        est_min: v.estMin,
        planned_for: v.plannedFor,
        position,
        due_on: v.dueOn,
        notes: v.notes,
      })
      .eq("id", v.id)
      .select(TASK_COLUMNS)
      .single(),
    "save the task",
  ) as unknown as TaskRow;
  return toTask(row);
}

/** Done / reopen / drop / restore. Dropping is reversible; nothing is hard-deleted. */
export async function setTaskStatus(
  ctx: Ctx,
  input: z.input<typeof taskStatusInput>,
): Promise<Task> {
  const v = parse(taskStatusInput, input);
  const row = check(
    await ctx.db
      .from("tasks")
      .update({
        status: v.status,
        completed_at: v.status === "done" ? ctx.now.toISOString() : null,
      })
      .eq("id", v.id)
      .select(TASK_COLUMNS)
      .maybeSingle(),
    "update the task",
  ) as unknown as TaskRow | null;
  if (!row) throw new ServiceError("That task no longer exists.");
  return toTask(row);
}

/** Moves a task to a day (or unplans it). `slipped` counts the move against the task. */
export async function planTask(ctx: Ctx, input: z.input<typeof planTaskInput>): Promise<Task> {
  const v = parse(planTaskInput, input);
  const current = await getTask(ctx, v.id);
  if (!current) throw new ServiceError("That task no longer exists.");
  const position = v.day ? await nextPosition(ctx, v.day) : null;
  const row = check(
    await ctx.db
      .from("tasks")
      .update({
        planned_for: v.day,
        position,
        slip_count: v.slipped ? current.slipCount + 1 : current.slipCount,
      })
      .eq("id", v.id)
      .select(TASK_COLUMNS)
      .single(),
    "move the task",
  ) as unknown as TaskRow;
  return toTask(row);
}

/** Sets the order of a day's tasks (first three are the day's top 3). */
export async function reorderDay(ctx: Ctx, day: IsoDate, orderedIds: string[]): Promise<void> {
  for (const [i, id] of orderedIds.entries()) {
    check(
      await ctx.db
        .from("tasks")
        .update({ position: i + 1 })
        .eq("id", id)
        .eq("planned_for", day),
      "reorder the day",
    );
  }
}

/** Open tasks planned for a day before `day` (they slipped without a check-in). */
export async function overdueTasks(ctx: Ctx, day: IsoDate): Promise<Task[]> {
  const rows = check(
    await ctx.db
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("status", "open")
      .lt("planned_for", day)
      .order("planned_for")
      .order("position", { nullsFirst: false }),
    "load earlier tasks",
  ) as unknown as TaskRow[];
  return (rows ?? []).map(toTask);
}
