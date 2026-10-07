import "server-only";
import { addDays, minutesBetween, type IsoDate } from "@/domain/day";
import {
  checkDay,
  suggestOverloadFix,
  type DayCheck,
  type DayLoad,
  type OverloadFix,
} from "@/domain/capacity";
import { check, ServiceError, type Ctx } from "@/server/context";
import { moveForFix } from "@/server/services/plan-moves";

/**
 * Planned load per day: focus blocks (W.A.R.D. calendar) plus open tasks
 * planned for the day. Feeds the plan check on Today and the Week screen.
 */
export async function loadForDays(ctx: Ctx, from: IsoDate, count: number): Promise<DayLoad[]> {
  const to = addDays(from, count - 1);
  const [tasks, blocks] = await Promise.all([
    ctx.db
      .from("tasks")
      .select("id, title, est_min, planned_for, goal:goals!tasks_goal_fk(rank)")
      .eq("status", "open")
      .gte("planned_for", from)
      .lte("planned_for", to),
    ctx.db
      .from("calendar_blocks")
      .select(
        "id, title, starts_at, ends_at, day, task_id, outcome, goal:goals!calendar_blocks_goal_fk(rank)",
      )
      .eq("kind", "focus")
      .is("deleted_at", null)
      .gte("day", from)
      .lte("day", to),
  ]);
  const taskRows = check(tasks, "load planned tasks") ?? [];
  const blockRows = check(blocks, "load focus blocks") ?? [];

  const days: DayLoad[] = [];
  for (let i = 0; i < count; i++) {
    const day = addDays(from, i);
    days.push({
      day,
      tasks: taskRows
        .filter((t) => t.planned_for === day)
        .map((t) => ({
          id: t.id,
          title: t.title,
          estMin: t.est_min,
          goalRank: (t.goal as unknown as { rank: number } | null)?.rank ?? 3,
        })),
      blocks: blockRows
        .filter((b) => b.day === day)
        .map((b) => ({
          id: b.id,
          title: b.title,
          minutes: minutesBetween(new Date(b.starts_at), new Date(b.ends_at)),
          startsAt: new Date(b.starts_at),
          taskId: b.task_id,
          goalRank: (b.goal as unknown as { rank: number } | null)?.rank ?? null,
          outcome: b.outcome as DayLoad["blocks"][number]["outcome"],
        })),
    });
  }
  return days;
}

export type PlanCheck = DayCheck & { day: IsoDate; fix: OverloadFix | null };

/** Check one day against capacity, with a proposed fix using the following week. */
export async function planCheck(ctx: Ctx, day: IsoDate): Promise<PlanCheck> {
  const days = await loadForDays(ctx, day, 8);
  const capacity = ctx.settings.focus_capacity_min;
  const result = checkDay(days[0], capacity);
  const fix = result.overBy > 0 ? suggestOverloadFix(days, 0, capacity, ctx.now) : null;
  return { ...result, day, fix };
}

/**
 * Applies the overload fix proposed for a day. The fix is recomputed here
 * from current data, so the client can't move anything it wasn't shown.
 * `expected` is the list of item ids the user saw; a mismatch is refused.
 */
export async function applyOverloadFix(
  ctx: Ctx,
  day: IsoDate,
  expected: string[],
): Promise<{ moved: number }> {
  const { fix } = await planCheck(ctx, day);
  if (!fix || fix.moves.length === 0) return { moved: 0 };
  const ids = fix.moves.map((m) => (m.item.kind === "task" ? m.item.taskId : m.item.blockId));
  if (ids.join(",") !== expected.join(",")) {
    throw new ServiceError("The plan changed. Check the new suggestion.");
  }
  let moved = 0;
  for (const move of fix.moves) {
    if (!move.toDay) continue;
    await moveForFix(ctx, move.item, move.toDay);
    moved++;
  }
  return { moved };
}
