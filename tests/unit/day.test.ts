import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  dayBounds,
  daysBetween,
  isValidTimeZone,
  localTime,
  logicalDay,
  logicalInstant,
  minutesBetween,
  startOfWeek,
  weekday,
  zonedInstant,
} from "@/domain/day";

const TZ = "Asia/Jerusalem";

describe("logicalDay", () => {
  it("returns the local calendar date during the day", () => {
    // 2026-10-07 12:00 in Jerusalem (UTC+3)
    expect(logicalDay(new Date("2026-10-07T09:00:00Z"), TZ)).toBe("2026-10-07");
  });

  it("counts times before the rollover as the previous day", () => {
    // 00:40 local on Oct 8 belongs to Oct 7
    expect(logicalDay(new Date("2026-10-07T21:40:00Z"), TZ)).toBe("2026-10-07");
    // 03:59 local still previous day, 04:00 is the new day
    expect(logicalDay(new Date("2026-10-08T00:59:00Z"), TZ)).toBe("2026-10-07");
    expect(logicalDay(new Date("2026-10-08T01:00:00Z"), TZ)).toBe("2026-10-08");
  });

  it("uses midnight when the rollover is 00:00", () => {
    expect(logicalDay(new Date("2026-10-07T21:40:00Z"), TZ, "00:00")).toBe("2026-10-08");
  });

  it("respects the time zone, not UTC", () => {
    // 23:30 UTC on Oct 7 is 02:30 Oct 8 in Jerusalem → logical Oct 7; in New York it's 19:30 Oct 7
    const instant = new Date("2026-10-07T23:30:00Z");
    expect(logicalDay(instant, TZ)).toBe("2026-10-07");
    expect(logicalDay(instant, "America/New_York")).toBe("2026-10-07");
    expect(logicalDay(new Date("2026-10-08T03:30:00Z"), "UTC")).toBe("2026-10-07");
  });

  it("handles the Israel DST change (last Sunday of October 2026, 02:00 → 01:00)", () => {
    // Clocks fall back on 2026-10-25. 03:30 local after the change is 01:30Z.
    expect(logicalDay(new Date("2026-10-25T01:30:00Z"), TZ)).toBe("2026-10-24");
    expect(logicalDay(new Date("2026-10-25T02:00:00Z"), TZ)).toBe("2026-10-25");
  });
});

describe("zonedInstant and logicalInstant", () => {
  it("converts a local wall time to the right instant across DST", () => {
    expect(zonedInstant("2026-10-07", "11:00", TZ).toISOString()).toBe("2026-10-07T08:00:00.000Z");
    // After DST ends Israel is UTC+2
    expect(zonedInstant("2026-10-26", "11:00", TZ).toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("accepts Postgres HH:MM:SS times", () => {
    expect(zonedInstant("2026-10-07", "11:00:00", TZ).toISOString()).toBe(
      "2026-10-07T08:00:00.000Z",
    );
  });

  it("puts times before the rollover on the next calendar date", () => {
    expect(logicalInstant("2026-10-07", "01:00", TZ).toISOString()).toBe(
      "2026-10-07T22:00:00.000Z",
    );
    expect(logicalInstant("2026-10-07", "22:30", TZ).toISOString()).toBe(
      "2026-10-07T19:30:00.000Z",
    );
  });

  it("dayBounds spans rollover to rollover", () => {
    const { start, end } = dayBounds("2026-10-07", TZ);
    expect(start.toISOString()).toBe("2026-10-07T01:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-08T01:00:00.000Z");
  });

  it("dayBounds is 25 hours long on the DST fall-back day", () => {
    const { start, end } = dayBounds("2026-10-24", TZ);
    expect(minutesBetween(start, end)).toBe(25 * 60);
  });
});

describe("calendar helpers", () => {
  it("adds days and counts days between", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysBetween("2026-10-08", "2026-10-01")).toBe(-7);
  });

  it("weekday is 0 for Sunday", () => {
    expect(weekday("2026-10-04")).toBe(0); // Sunday
    expect(weekday("2026-10-10")).toBe(6); // Saturday
  });

  it("startOfWeek honours the configured first day", () => {
    expect(startOfWeek("2026-10-07", 0)).toBe("2026-10-04"); // Wed → Sun
    expect(startOfWeek("2026-10-04", 0)).toBe("2026-10-04");
    expect(startOfWeek("2026-10-07", 1)).toBe("2026-10-05"); // Monday weeks
    expect(startOfWeek("2026-10-04", 1)).toBe("2026-09-28");
  });

  it("dateRange is inclusive and empty when reversed", () => {
    expect(dateRange("2026-10-30", "2026-11-01")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(dateRange("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("localTime formats HH:MM in the zone", () => {
    expect(localTime(new Date("2026-10-07T08:05:00Z"), TZ)).toBe("11:05");
  });

  it("validates time zones", () => {
    expect(isValidTimeZone("Asia/Jerusalem")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
