"use server";

import { run, type ActionResult } from "@/server/actions/run";
import { applyOverloadFix } from "@/server/services/capacity";
import { setOneThing } from "@/server/services/plans";
import { planTask, setTaskStatus } from "@/server/services/tasks";

export async function setOneThingAction(day: string, taskId: string | null): Promise<ActionResult> {
  const result = await run((ctx) => setOneThing(ctx, { day, taskId }));
  return result.ok ? { ok: true } : result;
}

export async function applyOverloadFixAction(day: string, ids: string[]): Promise<ActionResult> {
  const result = await run((ctx) => applyOverloadFix(ctx, day, ids));
  return result.ok ? { ok: true } : result;
}

/** A task left on an earlier day: bring it to today (counts as a slip) or drop it. */
export async function resolveEarlierTaskAction(
  id: string,
  choice: "today" | "drop",
): Promise<ActionResult> {
  const result = await run((ctx) =>
    choice === "today"
      ? planTask(ctx, { id, day: ctx.today, slipped: true })
      : setTaskStatus(ctx, { id, status: "dropped" }),
  );
  return result.ok ? { ok: true } : result;
}
