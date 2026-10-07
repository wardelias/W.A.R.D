"use server";

import { redirect } from "next/navigation";
import { run, type ActionResult } from "@/server/actions/run";
import {
  createHabit,
  logHabit,
  setHabitArchived,
  unlogHabit,
  updateHabit,
} from "@/server/services/habits";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

export async function saveHabitAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = field(formData, "id");
  const input = {
    name: field(formData, "name"),
    minimumVersion: field(formData, "minimumVersion"),
    goalId: field(formData, "goalId"),
    scheduleKind: field(formData, "scheduleKind") as "daily" | "days" | "per_week",
    scheduleDays: formData.getAll("scheduleDays").map(String),
    perWeek: field(formData, "perWeek"),
    targetTime: field(formData, "targetTime"),
    blockMin: field(formData, "blockMin"),
    strict: formData.get("strict") === "on",
  };
  const result = await run((ctx) =>
    id ? updateHabit(ctx, { id, ...input }) : createHabit(ctx, input),
  );
  if (!result.ok) return result;
  redirect(`/habits/${result.data!.id}`);
}

export async function archiveHabitAction(id: string, archived: boolean): Promise<ActionResult> {
  const result = await run((ctx) => setHabitArchived(ctx, id, archived));
  return result.ok ? { ok: true } : result;
}

export async function logHabitAction(
  habitId: string,
  level: "full" | "minimum",
  day?: string,
): Promise<ActionResult> {
  const result = await run((ctx) => logHabit(ctx, { habitId, level, day }));
  return result.ok ? { ok: true } : result;
}

export async function unlogHabitAction(habitId: string, day?: string): Promise<ActionResult> {
  const result = await run((ctx) => unlogHabit(ctx, { habitId, day }));
  return result.ok ? { ok: true } : result;
}
