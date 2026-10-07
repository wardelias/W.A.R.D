import { describe, expect, it } from "vitest";
import { nextSlot, nextSlots, type SlotInput } from "@/domain/slots";

const TZ = "Asia/Jerusalem"; // UTC+3 in early October 2026
const at = (hhmm: string, date = "2026-10-07") => new Date(`${date}T${hhmm}:00+03:00`);
const iso = (d: Date | undefined | null) => d?.toISOString() ?? null;

const base = (over: Partial<SlotInput> = {}): SlotInput => ({
  day: "2026-10-07",
  now: at("09:00"),
  timeZone: TZ,
  windows: [
    { start: "11:00", end: "15:00" },
    { start: "18:00", end: "22:00" },
  ],
  busy: [],
  focusBlocks: [],
  blockMin: 45,
  breakMin: 15,
  ...over,
});

describe("nextSlot", () => {
  it("starts at the first window when the day is empty", () => {
    expect(iso(nextSlot(base())?.start)).toBe(iso(at("11:00")));
  });

  it("never starts in the past, rounding up to 5 minutes", () => {
    const slot = nextSlot(base({ now: at("11:07") }));
    expect(iso(slot?.start)).toBe(iso(at("11:10")));
    expect(iso(slot?.end)).toBe(iso(at("11:55")));
  });

  it("skips busy events", () => {
    const slot = nextSlot(base({ busy: [{ start: at("11:00"), end: at("12:30") }] }));
    expect(iso(slot?.start)).toBe(iso(at("12:30")));
  });

  it("keeps a break after an existing focus block", () => {
    const slot = nextSlot(base({ focusBlocks: [{ start: at("11:00"), end: at("11:45") }] }));
    expect(iso(slot?.start)).toBe(iso(at("12:00")));
  });

  it("keeps a break before a following focus block", () => {
    // 11:00–11:45 would leave only 5 minutes before the 11:50 block
    const slot = nextSlot(base({ focusBlocks: [{ start: at("11:50"), end: at("12:35") }] }));
    expect(iso(slot?.start)).toBe(iso(at("12:50")));
  });

  it("moves to the next window when the first is full", () => {
    const slot = nextSlot(base({ busy: [{ start: at("11:00"), end: at("14:30") }] }));
    expect(iso(slot?.start)).toBe(iso(at("18:00")));
  });

  it("returns null when nothing fits today", () => {
    expect(nextSlot(base({ now: at("21:30") }))).toBeNull();
  });

  it("handles a window that runs past midnight (logical day)", () => {
    const slot = nextSlot(base({ windows: [{ start: "23:30", end: "01:00" }], now: at("23:00") }));
    expect(iso(slot?.start)).toBe(iso(at("23:30")));
    expect(iso(slot?.end)).toBe(iso(at("00:15", "2026-10-08")));
  });
});

describe("nextSlot window edge", () => {
  it("treats a window ending before it starts (same side of rollover) as overnight", () => {
    const slot = nextSlot(
      base({ windows: [{ start: "20:00", end: "05:00" }], now: at("19:00"), blockMin: 60 }),
    );
    expect(iso(slot?.start)).toBe(iso(at("20:00")));
  });
});

describe("nextSlots", () => {
  it("places consecutive 45/15 blocks", () => {
    const slots = nextSlots(base(), 3);
    expect(slots.map((s) => iso(s.start))).toEqual(
      [at("11:00"), at("12:00"), at("13:00")].map(iso),
    );
  });

  it("returns fewer slots when the day runs out", () => {
    expect(nextSlots(base({ now: at("20:00") }), 3)).toHaveLength(2);
  });
});
