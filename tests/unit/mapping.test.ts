import { describe, expect, it } from "vitest";
import { blockTitleFromEvent, toCachedEvent } from "@/server/google/mapping";
import { blockIdFromEventId, eventIdForBlock } from "@/server/google/provider";

describe("toCachedEvent", () => {
  it("maps a timed event and keeps only what W.A.R.D. shows", () => {
    const row = toCachedEvent({
      id: "abc",
      status: "confirmed",
      summary: "  Data Structures lecture ",
      start: { dateTime: "2026-10-07T13:00:00+03:00" },
      end: { dateTime: "2026-10-07T14:30:00+03:00" },
      htmlLink: "https://www.google.com/calendar/event?eid=x",
    });
    expect(row).toEqual({
      id: "abc",
      title: "Data Structures lecture",
      starts_at: "2026-10-07T10:00:00.000Z",
      ends_at: "2026-10-07T11:30:00.000Z",
      start_date: null,
      end_date: null,
      all_day: false,
      busy: true,
      status: "confirmed",
      html_link: "https://www.google.com/calendar/event?eid=x",
    });
  });

  it("maps all-day events by date and free events as not busy", () => {
    const row = toCachedEvent({
      id: "d",
      status: "tentative",
      summary: "ראש השנה",
      start: { date: "2026-10-07" },
      end: { date: "2026-10-08" },
      transparency: "transparent",
    });
    expect(row).toMatchObject({
      all_day: true,
      start_date: "2026-10-07",
      end_date: "2026-10-08",
      busy: false,
      status: "tentative",
    });
  });

  it("skips cancelled events and events without times", () => {
    expect(toCachedEvent({ id: "x", status: "cancelled" })).toBeNull();
    expect(
      toCachedEvent({ id: "y", status: "confirmed", start: { dateTime: "2026-10-07T10:00:00Z" } }),
    ).toBeNull();
  });

  it("gives untitled events a placeholder and drops non-https links", () => {
    const row = toCachedEvent({
      id: "z",
      status: "confirmed",
      start: { dateTime: "2026-10-07T10:00:00Z" },
      end: { dateTime: "2026-10-07T11:00:00Z" },
      htmlLink: "javascript:alert(1)",
    });
    expect(row?.title).toBe("(no title)");
    expect(row?.html_link).toBeNull();
  });
});

describe("block ids", () => {
  it("round-trips a block UUID through a Google event id", () => {
    const id = "3f2c1b7e-0a4d-4c55-9e2a-7b8c9d0e1f23";
    const eventId = eventIdForBlock(id);
    expect(eventId).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(blockIdFromEventId(eventId)).toBe(id);
    expect(blockIdFromEventId("not-ours")).toBeNull();
  });

  it("reads block titles back without bidi isolates", () => {
    expect(blockTitleFromEvent({ id: "a", status: "confirmed", summary: "Focus · ⁨סיכום⁩" })).toBe(
      "Focus · סיכום",
    );
  });
});
