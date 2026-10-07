import {
  addDays,
  compareDates,
  dateRange,
  daysBetween,
  startOfWeek,
  weekday,
  type IsoDate,
} from "./day";

/**
 * Habit schedules, streaks with grace, and honest stats (plan §5.2).
 *
 * A *period* is one scheduled day ("daily"/"days") or one week ("per_week").
 * Each finished period is a hit (full or minimum) or a miss. The current
 * period is pending until it is hit: it never counts and never breaks a streak.
 *
 * Walking back from the newest finished period: a hit adds 1. A miss is
 * forgiven (adds 0, the streak continues) only if the next newer period was
 * not a miss and forgiving it keeps at most `graceAllowed` forgiven misses in
 * any `graceWindow` consecutive periods. Any other miss ends the streak.
 */

export type ScheduleKind = "daily" | "days" | "per_week";
export type LogLevel = "full" | "minimum";

export type HabitRule = {
  scheduleKind: ScheduleKind;
  scheduleDays: number[] | null;
  perWeek: number | null;
  graceAllowed: number;
  graceWindow: number;
  startsOn: IsoDate;
};

/** Logs keyed by logical day. */
export type HabitLogs = ReadonlyMap<IsoDate, LogLevel>;

export type Outcome = "hit" | "miss" | "pending";

export type Period = {
  /** The scheduled day, or the first day of the week for per_week habits. */
  key: IsoDate;
  outcome: Outcome;
  /** Logs that fall in the period (per_week: count in that week). */
  hits: number;
};

export type StreakResult = {
  streak: number;
  /** Periods whose miss was forgiven inside the current run (newest first). */
  forgiven: IsoDate[];
  /** State of the current period: hit, open (pending), or not scheduled today. */
  current: "hit" | "pending" | "none";
  lastFinished: "hit" | "miss" | null;
  /** The last finished period was a miss and the current one is still open. */
  neverMissTwice: boolean;
};

export function defaultGraceWindow(kind: ScheduleKind): number {
  return kind === "per_week" ? 4 : 7;
}

/** Whether a daily/days habit is scheduled on a date (per_week habits are always loggable). */
export function isScheduledOn(rule: HabitRule, date: IsoDate): boolean {
  if (compareDates(date, rule.startsOn) < 0) return false;
  switch (rule.scheduleKind) {
    case "daily":
    case "per_week":
      return true;
    case "days":
      return (rule.scheduleDays ?? []).includes(weekday(date));
  }
}

/** Periods from the habit's start up to and including the one containing `today`. */
export function periods(
  rule: HabitRule,
  logs: HabitLogs,
  today: IsoDate,
  weekStart: number,
): Period[] {
  if (compareDates(today, rule.startsOn) < 0) return [];

  if (rule.scheduleKind === "per_week") {
    const target = rule.perWeek ?? 1;
    const out: Period[] = [];
    const currentWeek = startOfWeek(today, weekStart);
    for (
      let w = startOfWeek(rule.startsOn, weekStart);
      compareDates(w, currentWeek) <= 0;
      w = addDays(w, 7)
    ) {
      const days = dateRange(w, addDays(w, 6)).filter(
        (d) => compareDates(d, rule.startsOn) >= 0 && compareDates(d, today) <= 0,
      );
      const hits = days.filter((d) => logs.has(d)).length;
      const isCurrent = w === currentWeek;
      const outcome: Outcome = hits >= target ? "hit" : isCurrent ? "pending" : "miss";
      out.push({ key: w, outcome, hits });
    }
    return out;
  }

  return dateRange(rule.startsOn, today)
    .filter((d) => isScheduledOn(rule, d))
    .map((d) => {
      const hit = logs.has(d);
      const outcome: Outcome = hit ? "hit" : d === today ? "pending" : "miss";
      return { key: d, outcome, hits: hit ? 1 : 0 };
    });
}

export function computeStreak(
  rule: HabitRule,
  logs: HabitLogs,
  today: IsoDate,
  weekStart: number,
): StreakResult {
  const list = periods(rule, logs, today, weekStart);
  const last = list.at(-1);

  let current: StreakResult["current"] = "none";
  if (last) {
    const isCurrentPeriod =
      rule.scheduleKind === "per_week"
        ? last.key === startOfWeek(today, weekStart)
        : last.key === today;
    if (isCurrentPeriod) current = last.outcome === "hit" ? "hit" : "pending";
  }

  const finished = list.filter((p) => p.outcome !== "pending");
  const lastFinishedPeriod = current === "hit" ? finished.at(-2) : finished.at(-1);
  const lastFinished = lastFinishedPeriod ? (lastFinishedPeriod.outcome as "hit" | "miss") : null;

  let streak = 0;
  const forgivenIdx: number[] = [];
  for (let i = finished.length - 1; i >= 0; i--) {
    const p = finished[i];
    if (p.outcome === "hit") {
      streak++;
      continue;
    }
    const newer = finished[i + 1];
    if (newer && newer.outcome === "miss") break; // never twice in a row
    const inWindow = forgivenIdx.filter((f) => f - i < rule.graceWindow).length;
    if (inWindow + 1 > rule.graceAllowed) break;
    forgivenIdx.push(i);
  }

  return {
    streak,
    forgiven: forgivenIdx.map((i) => finished[i].key),
    current,
    lastFinished,
    neverMissTwice: current === "pending" && lastFinished === "miss",
  };
}

export type HabitStats = {
  full: number;
  minimum: number;
  missed: number;
  /** Finished scheduled periods in the window, plus today when already hit. */
  scheduled: number;
  /** Share of scheduled periods hit, 0–1, or null with nothing scheduled yet. */
  rate: number | null;
};

/**
 * Honest numbers for the last `days` days (default 30). For per_week habits,
 * full/minimum count logs and missed/scheduled count weeks.
 */
export function habitStats(
  rule: HabitRule,
  logs: HabitLogs,
  today: IsoDate,
  weekStart: number,
  days = 30,
): HabitStats {
  const from = addDays(today, -(days - 1));
  let full = 0;
  let minimum = 0;
  for (const [d, level] of logs) {
    if (compareDates(d, from) < 0 || compareDates(d, today) > 0) continue;
    if (compareDates(d, rule.startsOn) < 0) continue;
    if (rule.scheduleKind !== "per_week" && !isScheduledOn(rule, d)) continue;
    if (level === "full") full++;
    else minimum++;
  }

  const inWindow = periods(rule, logs, today, weekStart).filter((p) =>
    rule.scheduleKind === "per_week"
      ? daysBetween(p.key, today) < days
      : compareDates(p.key, from) >= 0,
  );
  const counted = inWindow.filter((p) => p.outcome !== "pending");
  const missed = counted.filter((p) => p.outcome === "miss").length;
  const scheduled = counted.length;
  const hitPeriods = scheduled - missed;
  return { full, minimum, missed, scheduled, rate: scheduled ? hitPeriods / scheduled : null };
}
