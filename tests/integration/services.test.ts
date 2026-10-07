import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays, localTime, logicalInstant } from "@/domain/day";
import { saveConnection } from "@/server/google/accounts";
import { resetFakeCalendar } from "@/server/google/fake-provider";
import { setupCalendars } from "@/server/google/setup";
import { createAdminClient } from "@/server/supabase/admin";
import { createFocusBlocks, deleteBlock, getBlock } from "@/server/services/blocks";
import { applyOverloadFix, planCheck } from "@/server/services/capacity";
import { closeDay, focusBlocksForDay } from "@/server/services/checkin";
import { listGoals } from "@/server/services/goals";
import { createHabit, setHabitArchived, updateHabit } from "@/server/services/habits";
import { createTask, getTask } from "@/server/services/tasks";
import { userCtx } from "./ctx";

let ctx: Awaited<ReturnType<typeof userCtx>>;
let goals: Awaited<ReturnType<typeof listGoals>>;

// A fixed "now" at 09:00 local, so focus windows and rollover are predictable.
function morning(): Date {
  const base = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(base);
  return logicalInstant(day, "09:00", "Asia/Jerusalem");
}

beforeEach(async () => {
  resetFakeCalendar();
  ctx = await userCtx(morning());
  goals = await listGoals(ctx);
  const admin = createAdminClient();
  await saveConnection(admin, ctx.userId, {
    sub: "fake",
    email: ctx.email,
    scopes: [],
    refreshToken: "x",
  });
  await setupCalendars(admin, ctx.userId, ctx.settings.timezone);
});

afterEach(async () => {
  await ctx.cleanup();
});

const grades = () => goals.find((g) => g.rank === 1)!.id;
const health = () => goals.find((g) => g.rank === 3)!.id;
const at = (day: string, time: string) =>
  logicalInstant(day, time, ctx.settings.timezone, ctx.settings.day_rollover);

describe("overload fix with focus blocks", () => {
  it("moves the lowest-ladder task together with its blocks to the next day with room", async () => {
    const big = await createTask(ctx, {
      title: "Exam prep",
      goalId: grades(),
      estMin: 330,
      plannedFor: ctx.today,
      dueOn: null,
      notes: null,
    });
    const gym = await createTask(ctx, {
      title: "Gym plan",
      goalId: health(),
      estMin: null,
      plannedFor: ctx.today,
      dueOn: null,
      notes: null,
    });
    await createFocusBlocks(ctx, {
      taskId: gym.id,
      goalId: null,
      starts: [at(ctx.today, "18:00").toISOString()],
      minutes: 45,
    });

    const check = await planCheck(ctx, ctx.today);
    expect(check.plannedMin).toBe(375);
    expect(check.overBy).toBe(15);
    expect(check.fix?.moves.map((m) => m.item.kind === "task" && m.item.taskId)).toEqual([gym.id]);

    await applyOverloadFix(ctx, ctx.today, [gym.id]);
    const moved = await getTask(ctx, gym.id);
    expect(moved?.plannedFor).toBe(addDays(ctx.today, 1));
    expect(moved?.slipCount).toBe(0); // planning, not a slip
    const [block] = await focusBlocksForDay(ctx, addDays(ctx.today, 1));
    expect(localTime(new Date(block.startsAt), ctx.settings.timezone)).toBe("18:00");
    expect((await planCheck(ctx, ctx.today)).overBy).toBe(0);
    expect(big.plannedFor).toBe(ctx.today);
  });

  it("refuses a fix the user didn't see", async () => {
    await createTask(ctx, {
      title: "A",
      goalId: grades(),
      estMin: 400,
      plannedFor: ctx.today,
      dueOn: null,
      notes: null,
    });
    await expect(
      applyOverloadFix(ctx, ctx.today, ["00000000-0000-4000-8000-000000000000"]),
    ).rejects.toThrow(/plan changed/);
  });
});

describe("habit blocks follow the habit", () => {
  it("creates blocks on save, retimes them on edit, removes them on archive", async () => {
    const habit = await createHabit(ctx, {
      name: "Gym",
      minimumVersion: "10 push-ups",
      goalId: health(),
      scheduleKind: "daily",
      scheduleDays: [],
      perWeek: null,
      targetTime: "16:00",
      blockMin: 60,
      strict: false,
    });
    const blocks = async () =>
      (
        await ctx.db
          .from("calendar_blocks")
          .select("starts_at, deleted_at, sync_state")
          .eq("habit_id", habit.id)
          .order("day")
      ).data!;
    let list = await blocks();
    expect(list.length).toBe(7);
    expect(list.every((b) => b.sync_state === "synced")).toBe(true);

    await updateHabit(ctx, {
      id: habit.id,
      name: "Gym",
      minimumVersion: "10 push-ups",
      goalId: health(),
      scheduleKind: "daily",
      scheduleDays: [],
      perWeek: null,
      targetTime: "17:30",
      blockMin: 60,
      strict: false,
    });
    list = await blocks();
    expect(
      list.every((b) => localTime(new Date(b.starts_at), ctx.settings.timezone) === "17:30"),
    ).toBe(true);

    await setHabitArchived(ctx, habit.id, true);
    list = await blocks();
    expect(list.every((b) => b.deleted_at !== null)).toBe(true);
  });
});

describe("check-in with focus blocks", () => {
  it("records outcomes and honest focus minutes", async () => {
    const task = await createTask(ctx, {
      title: "Algorithms",
      goalId: grades(),
      estMin: 90,
      plannedFor: ctx.today,
      dueOn: null,
      notes: null,
    });
    const created = await createFocusBlocks(ctx, {
      taskId: task.id,
      goalId: null,
      starts: [at(ctx.today, "11:00").toISOString(), at(ctx.today, "12:00").toISOString()],
      minutes: 45,
    });
    const review = await closeDay(ctx, {
      day: ctx.today,
      tasks: [{ id: task.id, action: "done" }],
      blocks: [
        { id: created[0].id, outcome: "done" },
        { id: created[1].id, outcome: "skipped" },
      ],
      firstTask: null,
      note: null,
    });
    expect(review.stats.focus).toEqual({ blocks: 2, plannedMin: 90, doneMin: 45, skipped: 1 });
    expect(review.stats.tasks).toEqual({ planned: 1, done: 1, moved: 0, dropped: 0 });
  });

  it("a deleted block disappears from the day", async () => {
    const [b] = await createFocusBlocks(ctx, {
      taskId: null,
      goalId: grades(),
      starts: [at(ctx.today, "11:00").toISOString()],
      minutes: 45,
    });
    await deleteBlock(ctx, b.id);
    expect(await getBlock(ctx, b.id)).toBeNull();
    expect(await focusBlocksForDay(ctx, ctx.today)).toEqual([]);
  });
});
