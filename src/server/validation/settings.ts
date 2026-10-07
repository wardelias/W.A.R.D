import { z } from "zod";
import { singleLine } from "@/domain/text";
import { timeZone, uuid, wallTime } from "./common";

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const focusWindow = z
  .object({ start: wallTime, end: wallTime })
  .refine((w) => w.start !== w.end, "A focus window needs a start and an end.");

export const scheduleInput = z
  .object({
    timezone: timeZone,
    wakeTime: wallTime,
    shutdownTime: wallTime,
    dayRollover: wallTime.refine(
      (t) => toMinutes(t) <= 6 * 60,
      "The day can end at 06:00 at the latest.",
    ),
    weekStart: z.coerce.number().int().min(0).max(6),
    focusWindows: z.array(focusWindow).min(1, "Add at least one focus window.").max(4),
    focusBlockMin: z.coerce.number().int().min(15).max(180),
    breakMin: z.coerce.number().int().min(0).max(60),
    capacityMin: z.coerce.number().int().min(60).max(720),
    blockReminders: z.boolean(),
  })
  .refine((v) => v.focusBlockMin % 5 === 0 && v.breakMin % 5 === 0, "Use multiples of 5 minutes.");
export type ScheduleInput = z.input<typeof scheduleInput>;

export const goalsInput = z.object({
  goals: z.array(z.object({ id: uuid, title: singleLine(80), label: singleLine(12) })).length(3),
});

export const themeInput = z.enum(["system", "light", "dark"]);
