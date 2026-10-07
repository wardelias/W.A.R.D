import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDate,
  formatMinutes,
  formatRelativeDay,
  formatTimeRange,
} from "@/lib/format";

describe("format", () => {
  it("formats dates as 'Tue 6 Oct'", () => {
    expect(formatDate("2026-10-06")).toBe("Tue 6 Oct");
  });

  it("formats days relative to today", () => {
    const today = "2026-10-07";
    expect(formatRelativeDay("2026-10-07", today)).toBe("Today");
    expect(formatRelativeDay("2026-10-08", today)).toBe("Tomorrow");
    expect(formatRelativeDay("2026-10-06", today)).toBe("Yesterday");
    expect(formatRelativeDay("2026-10-10", today)).toBe("Sat");
    expect(formatRelativeDay("2026-10-15", today)).toBe("Thu 15 Oct");
    expect(formatRelativeDay("2026-10-01", today)).toBe("Thu 1 Oct");
  });

  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(360)).toBe("6h");
    expect(formatMinutes(405)).toBe("6h 45m");
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(-40)).toBe("-40m");
  });

  it("formats 24-hour times in the user's zone", () => {
    const start = new Date("2026-10-07T08:00:00Z");
    const end = new Date("2026-10-07T08:45:00Z");
    expect(formatClock(start, "Asia/Jerusalem")).toBe("11:00");
    expect(formatTimeRange(start, end, "Asia/Jerusalem")).toBe("11:00–11:45");
  });
});
