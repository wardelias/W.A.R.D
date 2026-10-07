import { z } from "zod";
import { singleLine } from "@/domain/text";
import { emptyToNull, isoDate, optionalInt, uuid, wallTime } from "./common";

const scheduleDays = z
  .array(z.coerce.number().int().min(0).max(6))
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

export const habitInput = z
  .object({
    name: singleLine(80),
    minimumVersion: singleLine(120),
    goalId: uuid,
    scheduleKind: z.enum(["daily", "days", "per_week"]),
    scheduleDays: scheduleDays.default([]),
    perWeek: optionalInt(1, 7),
    targetTime: z.preprocess(emptyToNull, wallTime.nullable()),
    blockMin: optionalInt(5, 240),
    strict: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.scheduleKind === "days" && v.scheduleDays.length === 0) {
      ctx.addIssue({ code: "custom", message: "Pick at least one day.", path: ["scheduleDays"] });
    }
    if (v.scheduleKind === "per_week" && !v.perWeek) {
      ctx.addIssue({ code: "custom", message: "How many times a week?", path: ["perWeek"] });
    }
    if (v.blockMin && !v.targetTime) {
      ctx.addIssue({
        code: "custom",
        message: "A calendar block needs a time.",
        path: ["blockMin"],
      });
    }
  });
export type HabitInput = z.input<typeof habitInput>;

export const updateHabitInput = z.object({ id: uuid }).and(habitInput);

export const logHabitInput = z.object({
  habitId: uuid,
  level: z.enum(["full", "minimum"]),
  /** Defaults to today; yesterday is allowed to fix a forgotten log. */
  day: isoDate.optional(),
});

export const unlogHabitInput = z.object({ habitId: uuid, day: isoDate.optional() });
