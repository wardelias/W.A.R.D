import { z } from "zod";
import { optionalMultiline, singleLine } from "@/domain/text";
import { emptyToNull, isoDate, optionalInt, uuid } from "./common";

export const TASK_TITLE_MAX = 300;
export const TASK_NOTES_MAX = 5000;

export const createTaskInput = z.object({
  title: singleLine(TASK_TITLE_MAX),
  goalId: uuid,
  estMin: optionalInt(5, 600),
  plannedFor: z.preprocess(emptyToNull, isoDate.nullable()),
  dueOn: z.preprocess(emptyToNull, isoDate.nullable()),
  notes: optionalMultiline(TASK_NOTES_MAX),
});
export type CreateTaskInput = z.input<typeof createTaskInput>;

export const updateTaskInput = z.object({
  id: uuid,
  title: singleLine(TASK_TITLE_MAX),
  goalId: uuid,
  estMin: optionalInt(5, 600),
  plannedFor: z.preprocess(emptyToNull, isoDate.nullable()),
  dueOn: z.preprocess(emptyToNull, isoDate.nullable()),
  notes: optionalMultiline(TASK_NOTES_MAX),
});
export type UpdateTaskInput = z.input<typeof updateTaskInput>;

export const taskStatusInput = z.object({
  id: uuid,
  status: z.enum(["open", "done", "dropped"]),
});

export const planTaskInput = z.object({
  id: uuid,
  day: isoDate.nullable(),
  /** True when the check-in moves a task that slipped: counts toward slip_count. */
  slipped: z.boolean().default(false),
});

export const listTasksInput = z.object({
  status: z.enum(["open", "done", "dropped"]).default("open"),
});
