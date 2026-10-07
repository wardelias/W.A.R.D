import { describe, expect, it } from "vitest";
import { dueNudges as raw, MAX_PER_DAY, type NudgeHabit, type NudgeInput } from "@/domain/nudges";
import { stripIsolates } from "@/domain/text";

// User text is wrapped in bidi isolates; compare the visible text.
const dueNudges = (i: NudgeInput) =>
  raw(i).map((n) => ({ ...n, title: stripIsolates(n.title), body: stripIsolates(n.body) }));

const TZ = "Asia/Jerusalem";
const DAY = "2026-10-07";
const at = (hhmm: string, date = DAY) => new Date(`${date}T${hhmm}:00+03:00`);

const habit = (over: Partial<NudgeHabit> = {}): NudgeHabit => ({
  id: "h1",
  name: "Gym",
  minimumVersion: "10 push-ups",
  targetTime: "16:00",
  scheduledToday: true,
  loggedToday: false,
  neverMissTwice: false,
  ...over,
});

const input = (over: Partial<NudgeInput> = {}): NudgeInput => ({
  now: at("16:10"),
  day: DAY,
  timeZone: TZ,
  rollover: "04:00",
  shutdownTime: "22:30",
  habits: [habit()],
  habitNudges: true,
  shutdownNudge: true,
  dayClosed: false,
  openTasks: 2,
  tomorrowHasFirstTask: false,
  focusBlocks: [],
  sent: new Set(),
  ...over,
});

describe("habit nudges", () => {
  it("nudges once the habit's time has come, with Done and Minimum actions", () => {
    const [n] = dueNudges(input());
    expect(n).toMatchObject({
      key: "habit:h1",
      title: "Gym at 16:00",
      body: "Not logged yet. Done, or the minimum: 10 push-ups.",
      actions: [
        { action: "full", title: "Done" },
        { action: "minimum", title: "Minimum" },
      ],
    });
  });

  it("not before its time, not more than 2 hours after, not when logged or unscheduled", () => {
    expect(dueNudges(input({ now: at("15:59") }))).toEqual([]);
    expect(dueNudges(input({ now: at("18:01") }))).toEqual([]);
    expect(dueNudges(input({ habits: [habit({ loggedToday: true })] }))).toEqual([]);
    expect(dueNudges(input({ habits: [habit({ scheduledToday: false })] }))).toEqual([]);
    expect(dueNudges(input({ habits: [habit({ targetTime: null })] }))).toEqual([]);
  });

  it("only once a day", () => {
    expect(dueNudges(input({ sent: new Set(["habit:h1"]) }))).toEqual([]);
  });

  it("after a miss it says never miss twice and leads with the minimum", () => {
    const [n] = dueNudges(input({ habits: [habit({ neverMissTwice: true })] }));
    expect(n.title).toBe("Gym: never miss twice");
    expect(n.body).toBe("Missed last time. The minimum counts: 10 push-ups.");
    expect(n.actions[0]).toEqual({ action: "minimum", title: "Did the minimum" });
  });

  it("waits while a focus block is running", () => {
    const block = { start: at("16:00"), end: at("16:45") };
    expect(dueNudges(input({ focusBlocks: [block] }))).toEqual([]);
    expect(dueNudges(input({ focusBlocks: [block], now: at("16:46") }))).toHaveLength(1);
  });

  it("can be turned off", () => {
    expect(dueNudges(input({ habitNudges: false }))).toEqual([]);
  });
});

describe("shutdown reminder", () => {
  it("proposes closing the day with what's open", () => {
    const [n] = dueNudges(input({ habits: [], now: at("22:31") }));
    expect(n).toMatchObject({
      key: "shutdown",
      url: "/shutdown",
      body: "2 tasks still open, no first task for tomorrow yet. Close the day: about a minute.",
    });
  });

  it("still due after midnight (before the day ends), not once closed or sent", () => {
    expect(dueNudges(input({ habits: [], now: at("00:30", "2026-10-08") }))).toHaveLength(1);
    expect(dueNudges(input({ habits: [], now: at("22:31"), dayClosed: true }))).toEqual([]);
    expect(dueNudges(input({ habits: [], now: at("22:31"), sent: new Set(["shutdown"]) }))).toEqual(
      [],
    );
    expect(dueNudges(input({ habits: [], now: at("22:00") }))).toEqual([]);
  });

  it("singular wording and a set first task", () => {
    const [n] = dueNudges(
      input({ habits: [], now: at("23:00"), openTasks: 1, tomorrowHasFirstTask: true }),
    );
    expect(n.body).toBe("1 task still open. Close the day: about a minute.");
  });
});

describe("daily cap", () => {
  it(`sends at most ${MAX_PER_DAY} a day`, () => {
    const many = Array.from({ length: 6 }, (_, i) => habit({ id: `h${i}`, name: `H${i}` }));
    expect(dueNudges(input({ habits: many }))).toHaveLength(MAX_PER_DAY);
    expect(dueNudges(input({ habits: many, sent: new Set(["a", "b", "c"]) }))).toHaveLength(1);
    expect(dueNudges(input({ habits: many, sent: new Set(["a", "b", "c", "d"]) }))).toEqual([]);
  });
});
