"use server";

import { run, type ActionResult } from "@/server/actions/run";
import { closeDay } from "@/server/services/checkin";
import type { CloseDayInput } from "@/server/validation/checkin";

export async function closeDayAction(input: CloseDayInput): Promise<ActionResult> {
  const result = await run((ctx) => closeDay(ctx, input));
  return result.ok ? { ok: true } : result;
}
