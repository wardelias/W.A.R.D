"use server";

import { redirect } from "next/navigation";
import { run, type ActionResult } from "@/server/actions/run";
import {
  createFocusBlocks,
  deleteBlock,
  moveBlock,
  setBlockOutcome,
} from "@/server/services/blocks";

export async function addFocusBlocksAction(input: {
  taskId: string | null;
  goalId: string | null;
  starts: string[];
  minutes: number;
  returnTo: string;
}): Promise<ActionResult> {
  const result = await run((ctx) =>
    createFocusBlocks(ctx, {
      taskId: input.taskId,
      goalId: input.goalId,
      starts: input.starts,
      minutes: input.minutes,
    }),
  );
  if (!result.ok) return result;
  redirect(
    input.returnTo.startsWith("/") && !input.returnTo.startsWith("//") ? input.returnTo : "/today",
  );
}

export async function moveBlockAction(id: string, start: string): Promise<ActionResult> {
  const result = await run((ctx) => moveBlock(ctx, { id, start }));
  return result.ok ? { ok: true } : result;
}

export async function deleteBlockAction(id: string): Promise<ActionResult> {
  const result = await run((ctx) => deleteBlock(ctx, id));
  if (!result.ok) return result;
  redirect("/today");
}

export async function setBlockOutcomeAction(
  id: string,
  outcome: "done" | "partial" | "skipped" | null,
): Promise<ActionResult> {
  const result = await run((ctx) => setBlockOutcome(ctx, id, outcome));
  return result.ok ? { ok: true } : result;
}
