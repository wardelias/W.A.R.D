import "server-only";
import { z } from "zod";
import { dayBounds, type IsoDate } from "@/domain/day";
import { check, ServiceError, type Ctx } from "@/server/context";
import { getTask, planTask, reorderDay, tasksForDay } from "@/server/services/tasks";
import { isoDate, uuid } from "@/server/validation/common";
import { parse } from "@/server/validation/parse";

export type DayPlan = {
  day: IsoDate;
  mitTaskId: string | null;
  mitSetAt: string | null;
  /** The one thing was chosen before this logical day began (at last night's check-in). */
  setBeforeDay: boolean;
};

export async function getDayPlan(ctx: Ctx, day: IsoDate): Promise<DayPlan> {
  const row = check(
    await ctx.db
      .from("day_plans")
      .select("day, mit_task_id, mit_set_at")
      .eq("day", day)
      .maybeSingle(),
    "load the day plan",
  );
  const { start } = dayBounds(day, ctx.settings.timezone, ctx.settings.day_rollover);
  return {
    day,
    mitTaskId: row?.mit_task_id ?? null,
    mitSetAt: row?.mit_set_at ?? null,
    setBeforeDay: row?.mit_set_at ? new Date(row.mit_set_at) < start : false,
  };
}

const setOneThingInput = z.object({ day: isoDate, taskId: uuid.nullable() });

/**
 * Sets (or clears) the one thing for a day. The task is planned for that
 * day and moved to the top of its list.
 */
export async function setOneThing(
  ctx: Ctx,
  input: z.input<typeof setOneThingInput>,
): Promise<void> {
  const v = parse(setOneThingInput, input);
  if (v.taskId) {
    const task = await getTask(ctx, v.taskId);
    if (!task || task.status !== "open") throw new ServiceError("Pick an open task.");
    if (task.plannedFor !== v.day) await planTask(ctx, { id: task.id, day: v.day });
    const others = (await tasksForDay(ctx, v.day)).filter((t) => t.id !== task.id).map((t) => t.id);
    await reorderDay(ctx, v.day, [task.id, ...others]);
  }
  check(
    await ctx.db.from("day_plans").upsert(
      {
        user_id: ctx.userId,
        day: v.day,
        mit_task_id: v.taskId,
        mit_set_at: v.taskId ? ctx.now.toISOString() : null,
      },
      { onConflict: "user_id,day" },
    ),
    "save the one thing",
  );
}
