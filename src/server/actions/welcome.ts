"use server";

import { run, type ActionResult } from "@/server/actions/run";
import { createHabit } from "@/server/services/habits";

export async function addStarterHabitsAction(
  habits: { name: string; minimumVersion: string; goalId: string }[],
): Promise<ActionResult> {
  const result = await run(async (ctx) => {
    for (const h of habits.slice(0, 3)) {
      await createHabit(ctx, {
        name: h.name,
        minimumVersion: h.minimumVersion,
        goalId: h.goalId,
        scheduleKind: "daily",
        scheduleDays: [],
        perWeek: null,
        targetTime: null,
        blockMin: null,
        strict: false,
      });
    }
  });
  return result.ok ? { ok: true } : result;
}
