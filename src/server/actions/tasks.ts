"use server";

import { redirect } from "next/navigation";
import { run, type ActionResult } from "@/server/actions/run";
import { createTask, planTask, setTaskStatus, updateTask } from "@/server/services/tasks";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

export async function createTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await run((ctx) =>
    createTask(ctx, {
      title: field(formData, "title"),
      goalId: field(formData, "goalId"),
      estMin: field(formData, "estMin"),
      plannedFor: field(formData, "plannedFor"),
      dueOn: field(formData, "dueOn"),
      notes: field(formData, "notes"),
    }),
  );
  return result.ok ? { ok: true } : result;
}

export async function updateTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await run((ctx) =>
    updateTask(ctx, {
      id: field(formData, "id"),
      title: field(formData, "title"),
      goalId: field(formData, "goalId"),
      estMin: field(formData, "estMin"),
      plannedFor: field(formData, "plannedFor"),
      dueOn: field(formData, "dueOn"),
      notes: field(formData, "notes"),
    }),
  );
  if (!result.ok) return result;
  redirect(safeReturn(field(formData, "returnTo")));
}

export async function setTaskStatusAction(
  id: string,
  status: "open" | "done" | "dropped",
): Promise<ActionResult> {
  const result = await run((ctx) => setTaskStatus(ctx, { id, status }));
  return result.ok ? { ok: true } : result;
}

export async function planTaskAction(id: string, day: string | null): Promise<ActionResult> {
  const result = await run((ctx) => planTask(ctx, { id, day }));
  return result.ok ? { ok: true } : result;
}

function safeReturn(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/tasks";
}
