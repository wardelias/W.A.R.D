import { describe, expect, it } from "vitest";
import { habitInput } from "@/server/validation/habits";
import { scheduleInput } from "@/server/validation/settings";
import { createTaskInput } from "@/server/validation/tasks";

const schedule = {
  timezone: "Asia/Jerusalem",
  wakeTime: "10:00",
  shutdownTime: "22:30",
  dayRollover: "04:00",
  weekStart: 0,
  focusWindows: [{ start: "11:00", end: "15:00" }],
  focusBlockMin: 45,
  breakMin: 15,
  capacityMin: 360,
  blockReminders: true,
};

describe("settings validation", () => {
  it("accepts the defaults", () => {
    expect(scheduleInput.safeParse(schedule).success).toBe(true);
  });
  it.each([
    [{ timezone: "Mars/Olympus" }, "Unknown time zone."],
    [{ dayRollover: "07:00" }, "The day can end at 06:00 at the latest."],
    [{ focusWindows: [] }, "Add at least one focus window."],
    [
      { focusWindows: [{ start: "11:00", end: "11:00" }] },
      "A focus window needs a start and an end.",
    ],
    [{ focusBlockMin: 47 }, "Use multiples of 5 minutes."],
    [{ capacityMin: 30 }, undefined],
  ])("rejects %j", (over, message) => {
    const r = scheduleInput.safeParse({ ...schedule, ...over });
    expect(r.success).toBe(false);
    if (message) expect(r.error!.issues[0].message).toBe(message);
  });
});

describe("task validation", () => {
  const goalId = "3f2c1b7e-0a4d-4c55-9e2a-7b8c9d0e1f23";
  it("normalizes text and turns empty form values into null", () => {
    const v = createTaskInput.parse({
      title: "  סיכום\nהרצאה ",
      goalId,
      estMin: "",
      plannedFor: "",
      dueOn: "",
      notes: "  ",
    });
    expect(v).toEqual({
      title: "סיכום הרצאה",
      goalId,
      estMin: null,
      plannedFor: null,
      dueOn: null,
      notes: null,
    });
  });
  it("rejects bad estimates and dates", () => {
    expect(createTaskInput.safeParse({ title: "x", goalId, estMin: "3" }).success).toBe(false);
    expect(
      createTaskInput.safeParse({ title: "x", goalId, plannedFor: "2026-13-40" }).success,
    ).toBe(false);
    expect(createTaskInput.safeParse({ title: "x", goalId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("habit validation", () => {
  const base = {
    name: "Gym",
    minimumVersion: "10 push-ups",
    goalId: "3f2c1b7e-0a4d-4c55-9e2a-7b8c9d0e1f23",
    scheduleKind: "daily" as const,
    perWeek: null,
    targetTime: "",
    blockMin: "",
  };
  it("requires a minimum version", () => {
    expect(habitInput.safeParse({ ...base, minimumVersion: " " }).success).toBe(false);
  });
  it("needs a time for a calendar block", () => {
    const r = habitInput.safeParse({ ...base, blockMin: "60" });
    expect(r.error?.issues[0].message).toBe("A calendar block needs a time.");
  });
  it("dedupes and sorts chosen days", () => {
    const r = habitInput.parse({ ...base, scheduleKind: "days", scheduleDays: ["4", "0", "4"] });
    expect(r.scheduleDays).toEqual([0, 4]);
  });
});
