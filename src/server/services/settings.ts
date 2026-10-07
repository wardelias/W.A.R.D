import "server-only";
import { z } from "zod";
import { logicalDay } from "@/domain/day";
import { check, ServiceError, type Ctx } from "@/server/context";
import { pushNow } from "@/server/services/blocks";
import {
  goalsInput,
  scheduleInput,
  themeInput,
  type ScheduleInput,
} from "@/server/validation/settings";
import { parse } from "@/server/validation/parse";

export async function updateSchedule(ctx: Ctx, input: ScheduleInput): Promise<void> {
  const v = parse(scheduleInput, input);
  check(
    await ctx.db
      .from("settings")
      .update({
        timezone: v.timezone,
        wake_time: v.wakeTime,
        shutdown_time: v.shutdownTime,
        day_rollover: v.dayRollover,
        week_start: v.weekStart,
        focus_windows: v.focusWindows,
        focus_block_min: v.focusBlockMin,
        break_min: v.breakMin,
        focus_capacity_min: v.capacityMin,
        block_reminders: v.blockReminders,
      })
      .eq("user_id", ctx.userId),
    "save your settings",
  );

  const zoneChanged =
    v.timezone !== ctx.settings.timezone || v.dayRollover !== ctx.settings.day_rollover.slice(0, 5);
  const remindersChanged = v.blockReminders !== ctx.settings.block_reminders;
  if (!zoneChanged && !remindersChanged) return;

  // Blocks keep their instants; their logical day and reminders follow the new settings.
  const { data: blocks } = await ctx.db
    .from("calendar_blocks")
    .select("id, starts_at, day")
    .is("deleted_at", null)
    .gt("starts_at", ctx.now.toISOString());
  for (const b of blocks ?? []) {
    const day = logicalDay(new Date(b.starts_at), v.timezone, v.dayRollover);
    if (day === b.day && !remindersChanged) continue;
    await ctx.db
      .from("calendar_blocks")
      .update({ day, sync_state: "pending", changed_at: ctx.now.toISOString() })
      .eq("id", b.id);
  }
  await pushNow({
    ...ctx,
    settings: {
      ...ctx.settings,
      timezone: v.timezone,
      day_rollover: v.dayRollover,
      block_reminders: v.blockReminders,
    },
  });
}

/** Renames the three goals and sets their order (first = priority 1). */
export async function updateGoals(ctx: Ctx, input: z.input<typeof goalsInput>): Promise<void> {
  const v = parse(goalsInput, input);
  const ids = v.goals.map((g) => g.id);
  if (new Set(ids).size !== 3) throw new ServiceError("Each goal appears once.");
  const { error } = await ctx.db.rpc("reorder_goals", { p_ids: ids });
  if (error) throw new ServiceError("Couldn't reorder your goals. Try again.");
  for (const g of v.goals) {
    check(
      await ctx.db.from("goals").update({ title: g.title, label: g.label }).eq("id", g.id),
      "save your goals",
    );
  }
}

export async function updateTheme(ctx: Ctx, theme: z.input<typeof themeInput>): Promise<void> {
  const v = parse(themeInput, theme);
  check(
    await ctx.db.from("settings").update({ theme: v }).eq("user_id", ctx.userId),
    "save the theme",
  );
}

export async function completeOnboarding(ctx: Ctx): Promise<void> {
  check(
    await ctx.db
      .from("settings")
      .update({ onboarded_at: ctx.now.toISOString() })
      .eq("user_id", ctx.userId),
    "finish setup",
  );
}
