import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/day";
import {
  computeStreak,
  habitStats,
  isScheduledOn,
  periods,
  type HabitRule,
  type LogLevel,
} from "@/domain/habits";

const SUNDAY = 0;
const TODAY = "2026-10-21"; // a Wednesday

const daily = (over: Partial<HabitRule> = {}): HabitRule => ({
  scheduleKind: "daily",
  scheduleDays: null,
  perWeek: null,
  graceAllowed: 1,
  graceWindow: 7,
  startsOn: "2026-10-01",
  ...over,
});

/**
 * Builds logs from a pattern string read oldest → newest, ending at `end`.
 * "x" = full, "m" = minimum, "." = no log.
 */
function logsFrom(pattern: string, end: string = TODAY): Map<string, LogLevel> {
  const map = new Map<string, LogLevel>();
  const chars = [...pattern];
  chars.forEach((c, i) => {
    const day = addDays(end, i - (chars.length - 1));
    if (c === "x") map.set(day, "full");
    if (c === "m") map.set(day, "minimum");
  });
  return map;
}

describe("schedules", () => {
  it("days habits are scheduled only on chosen weekdays, from the start date", () => {
    const rule = daily({ scheduleKind: "days", scheduleDays: [0, 2, 4] });
    expect(isScheduledOn(rule, "2026-10-04")).toBe(true); // Sun
    expect(isScheduledOn(rule, "2026-10-05")).toBe(false); // Mon
    expect(isScheduledOn(rule, "2026-09-27")).toBe(false); // before start
  });

  it("per-week habits can be logged any day from the start", () => {
    const rule = daily({ scheduleKind: "per_week", perWeek: 3 });
    expect(isScheduledOn(rule, "2026-10-05")).toBe(true);
    expect(isScheduledOn(rule, "2026-09-30")).toBe(false);
  });

  it("no periods exist before the habit starts", () => {
    expect(periods(daily({ startsOn: "2026-10-22" }), new Map(), TODAY, SUNDAY)).toEqual([]);
  });
});

describe("computeStreak: daily habits", () => {
  const start = addDays(TODAY, -9); // 10 days including today

  it("counts consecutive hits, minimum versions included", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom("xxmxxxxxxx"), TODAY, SUNDAY);
    expect(r.streak).toBe(10);
    expect(r.current).toBe("hit");
    expect(r.forgiven).toEqual([]);
  });

  it("today unlogged is pending: it neither counts nor breaks", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom("xxxxxxxxx."), TODAY, SUNDAY);
    expect(r.streak).toBe(9);
    expect(r.current).toBe("pending");
    expect(r.neverMissTwice).toBe(false);
  });

  it("one miss is forgiven: the streak continues and the miss adds nothing", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom("xxxxx.xxxx"), TODAY, SUNDAY);
    expect(r.streak).toBe(9);
    expect(r.forgiven).toEqual([addDays(TODAY, -4)]);
  });

  it("two misses in a row end the streak", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom("xxxx..xxxx"), TODAY, SUNDAY);
    expect(r.streak).toBe(4);
  });

  it("missed yesterday with today open: forgiven for now, and prompts never-miss-twice", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom("xxxxxxxx.."), TODAY, SUNDAY);
    expect(r.streak).toBe(8);
    expect(r.forgiven).toEqual([addDays(TODAY, -1)]);
    expect(r.lastFinished).toBe("miss");
    expect(r.neverMissTwice).toBe(true);
  });

  it("logging today clears the never-miss-twice prompt", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom("xxxxxxxx.m"), TODAY, SUNDAY);
    expect(r.streak).toBe(9);
    expect(r.neverMissTwice).toBe(false);
    expect(r.lastFinished).toBe("miss");
  });

  it("allows only one forgiven miss per 7 scheduled days", () => {
    // misses 3 days apart: the older one falls within 7 periods of the newer forgiven miss
    const r = computeStreak(daily({ startsOn: start }), logsFrom("xxx.xx.xxx"), TODAY, SUNDAY);
    expect(r.streak).toBe(5);
    expect(r.forgiven).toEqual([addDays(TODAY, -3)]);
  });

  it("forgives again once the earlier grace is outside the window", () => {
    const pattern = "xx.xxxxxxx.xxx"; // misses 8 periods apart
    const r = computeStreak(
      daily({ startsOn: addDays(TODAY, -13) }),
      logsFrom(pattern),
      TODAY,
      SUNDAY,
    );
    expect(r.streak).toBe(12);
    expect(r.forgiven).toHaveLength(2);
  });

  it("alternating hit/miss can't keep a streak alive", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom("x.x.x.x.xx"), TODAY, SUNDAY);
    expect(r.streak).toBe(3);
  });

  it("strict habits (grace 0) reset on any miss", () => {
    const r = computeStreak(
      daily({ startsOn: start, graceAllowed: 0 }),
      logsFrom("xxxxx.xxxx"),
      TODAY,
      SUNDAY,
    );
    expect(r.streak).toBe(4);
  });

  it("a miss right at the start of history with nothing before it is forgiven", () => {
    const r = computeStreak(daily({ startsOn: start }), logsFrom(".xxxxxxxxx"), TODAY, SUNDAY);
    expect(r.streak).toBe(9);
  });

  it("a brand new habit starts at zero and pending", () => {
    const r = computeStreak(daily({ startsOn: TODAY }), new Map(), TODAY, SUNDAY);
    expect(r).toEqual({
      streak: 0,
      forgiven: [],
      current: "pending",
      lastFinished: null,
      neverMissTwice: false,
    });
  });
});

describe("computeStreak: days habits", () => {
  // Sun, Tue, Thu. TODAY (Wed 21st) is not scheduled.
  const rule = daily({ scheduleKind: "days", scheduleDays: [0, 2, 4], startsOn: "2026-10-04" });

  it("only scheduled days count; today unscheduled is 'none'", () => {
    // Logs on every scheduled day from Oct 4 through Tue Oct 20
    const logs = new Map<string, LogLevel>(
      [
        "2026-10-04",
        "2026-10-06",
        "2026-10-08",
        "2026-10-11",
        "2026-10-13",
        "2026-10-15",
        "2026-10-18",
        "2026-10-20",
      ].map((d) => [d, "full"]),
    );
    const r = computeStreak(rule, logs, TODAY, SUNDAY);
    expect(r.streak).toBe(8);
    expect(r.current).toBe("none");
    expect(r.neverMissTwice).toBe(false);
  });

  it("logs on unscheduled days don't count", () => {
    const logs = new Map<string, LogLevel>([["2026-10-19", "full"]]); // Monday
    const r = computeStreak(rule, logs, "2026-10-20", SUNDAY);
    expect(r.streak).toBe(0);
  });
});

describe("computeStreak: per-week habits", () => {
  // 3 times a week, weeks start Sunday. TODAY = Wed Oct 21; current week starts Oct 18.
  const rule = daily({
    scheduleKind: "per_week",
    perWeek: 3,
    startsOn: "2026-09-27",
    graceWindow: 4,
  });
  const week = (start: string, days: number[]) =>
    days.map((d) => [addDays(start, d), "full"] as const);

  it("counts hit weeks; the current week is pending until it reaches the target", () => {
    const logs = new Map<string, LogLevel>([
      ...week("2026-09-27", [0, 2, 4]),
      ...week("2026-10-04", [1, 3, 5]),
      ...week("2026-10-11", [0, 1, 2]),
      ...week("2026-10-18", [0]),
    ]);
    const r = computeStreak(rule, logs, TODAY, SUNDAY);
    expect(r.streak).toBe(3);
    expect(r.current).toBe("pending");
  });

  it("a week below target is a miss and can be forgiven once", () => {
    const logs = new Map<string, LogLevel>([
      ...week("2026-09-27", [0, 2, 4]),
      ...week("2026-10-04", [1]), // missed week
      ...week("2026-10-11", [0, 1, 2]),
      ...week("2026-10-18", [0, 1, 2]), // current week already hit
    ]);
    const r = computeStreak(rule, logs, TODAY, SUNDAY);
    expect(r.streak).toBe(3);
    expect(r.current).toBe("hit");
    expect(r.forgiven).toEqual(["2026-10-04"]);
  });
});

describe("habitStats", () => {
  it("reports full, minimum and missed honestly over the window", () => {
    const start = addDays(TODAY, -9);
    const s = habitStats(daily({ startsOn: start }), logsFrom("xxm.xx.mx."), TODAY, SUNDAY);
    // 10 days: today pending (not counted), 9 finished: 2 misses, 7 hits (5 full, 2 minimum)
    expect(s).toEqual({ full: 5, minimum: 2, missed: 2, scheduled: 9, rate: 7 / 9 });
  });

  it("counts today once it is logged", () => {
    const s = habitStats(daily({ startsOn: TODAY }), logsFrom("x"), TODAY, SUNDAY);
    expect(s).toEqual({ full: 1, minimum: 0, missed: 0, scheduled: 1, rate: 1 });
  });

  it("has no rate before anything was scheduled", () => {
    const s = habitStats(daily({ startsOn: TODAY }), new Map(), TODAY, SUNDAY);
    expect(s.rate).toBeNull();
  });

  it("ignores logs outside the window and before the start", () => {
    const logs = new Map<string, LogLevel>([
      [addDays(TODAY, -40), "full"],
      [addDays(TODAY, -1), "full"],
    ]);
    const s = habitStats(daily({ startsOn: addDays(TODAY, -1) }), logs, TODAY, SUNDAY);
    expect(s.full).toBe(1);
  });
});
