import { logicalInstant, type IsoDate } from "./day";
import type { Interval } from "./slots";
import { isolate } from "./text";

/**
 * Which notifications are due right now (plan step 15). Few and actionable:
 * - A habit nudge once, from the habit's time until two hours after, if it
 *   isn't logged yet. After a miss it says "never miss twice" and leads
 *   with the minimum version.
 * - A shutdown reminder once, from shutdown time until the day ends, if the
 *   day isn't closed yet.
 * - At most 4 per day, and none while a focus block is running (they wait
 *   for the break).
 */

export const MAX_PER_DAY = 4;
const HABIT_WINDOW_MS = 2 * 3_600_000;

export type NudgeHabit = {
  id: string;
  name: string;
  minimumVersion: string;
  targetTime: string | null;
  scheduledToday: boolean;
  loggedToday: boolean;
  neverMissTwice: boolean;
};

export type NudgeInput = {
  now: Date;
  day: IsoDate;
  timeZone: string;
  rollover: string;
  shutdownTime: string;
  habits: NudgeHabit[];
  habitNudges: boolean;
  shutdownNudge: boolean;
  dayClosed: boolean;
  openTasks: number;
  tomorrowHasFirstTask: boolean;
  focusBlocks: Interval[];
  /** Keys already sent today, e.g. "habit:<id>" or "shutdown". */
  sent: Set<string>;
};

export type Nudge = {
  key: string;
  kind: "habit" | "shutdown";
  refId: string | null;
  title: string;
  body: string;
  url: string;
  actions: { action: string; title: string }[];
};

export function dueNudges(input: NudgeInput): Nudge[] {
  const { now } = input;
  if (input.sent.size >= MAX_PER_DAY) return [];
  if (input.focusBlocks.some((b) => b.start <= now && now < b.end)) return [];

  const due: Nudge[] = [];

  if (input.habitNudges) {
    for (const h of input.habits) {
      if (!h.scheduledToday || h.loggedToday || !h.targetTime) continue;
      const key = `habit:${h.id}`;
      if (input.sent.has(key)) continue;
      const at = logicalInstant(input.day, h.targetTime, input.timeZone, input.rollover);
      if (now < at || now.getTime() > at.getTime() + HABIT_WINDOW_MS) continue;
      due.push(
        h.neverMissTwice
          ? {
              key,
              kind: "habit",
              refId: h.id,
              title: `${isolate(h.name)}: never miss twice`,
              body: `Missed last time. The minimum counts: ${isolate(h.minimumVersion)}.`,
              url: "/today",
              actions: [
                { action: "minimum", title: "Did the minimum" },
                { action: "full", title: "Done" },
              ],
            }
          : {
              key,
              kind: "habit",
              refId: h.id,
              title: `${isolate(h.name)} at ${h.targetTime.slice(0, 5)}`,
              body: `Not logged yet. Done, or the minimum: ${isolate(h.minimumVersion)}.`,
              url: "/today",
              actions: [
                { action: "full", title: "Done" },
                { action: "minimum", title: "Minimum" },
              ],
            },
      );
    }
  }

  if (input.shutdownNudge && !input.dayClosed && !input.sent.has("shutdown")) {
    const at = logicalInstant(input.day, input.shutdownTime, input.timeZone, input.rollover);
    if (now >= at) {
      const parts = [
        input.openTasks
          ? `${input.openTasks} task${input.openTasks === 1 ? "" : "s"} still open`
          : "Nothing left open",
        input.tomorrowHasFirstTask ? null : "no first task for tomorrow yet",
      ].filter(Boolean);
      due.push({
        key: "shutdown",
        kind: "shutdown",
        refId: null,
        title: "Shutdown",
        body: `${parts.join(", ")}. Close the day: about a minute.`,
        url: "/shutdown",
        actions: [],
      });
    }
  }

  return due.slice(0, MAX_PER_DAY - input.sent.size);
}
