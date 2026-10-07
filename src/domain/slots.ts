import { logicalInstant, parseTime, type IsoDate, type WallTime } from "./day";
import { Temporal } from "temporal-polyfill";

/**
 * Next free focus slot (plan §5.4): the earliest start, rounded up to 5 min
 * and not before `now`, inside a focus window, where [start, start+blockMin)
 * overlaps nothing busy and keeps a `breakMin` gap from other focus blocks.
 */

export type Interval = { start: Date; end: Date };
export type FocusWindow = { start: WallTime; end: WallTime };

export type SlotInput = {
  day: IsoDate;
  now: Date;
  timeZone: string;
  rollover?: WallTime;
  windows: FocusWindow[];
  /** Busy outside events (timed, marked busy) and habit blocks. */
  busy: Interval[];
  /** Existing focus blocks: kept `breakMin` apart from the new one. */
  focusBlocks: Interval[];
  blockMin: number;
  breakMin: number;
  /** Optional earliest start (e.g. "after this block"). */
  notBefore?: Date;
};

const STEP_MS = 5 * 60_000;

function roundUp(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / STEP_MS) * STEP_MS);
}

function windowInstants(
  w: FocusWindow,
  day: IsoDate,
  timeZone: string,
  rollover: WallTime,
): Interval {
  const start = logicalInstant(day, w.start, timeZone, rollover);
  let end = logicalInstant(day, w.end, timeZone, rollover);
  // A window that ends at or before it starts runs past midnight.
  if (end <= start && Temporal.PlainTime.compare(parseTime(w.end), parseTime(w.start)) <= 0) {
    end = new Date(end.getTime() + 24 * 3_600_000);
  }
  return { start, end };
}

export function nextSlot(input: SlotInput): Interval | null {
  const rollover = input.rollover ?? "04:00";
  const blockMs = input.blockMin * 60_000;
  const breakMs = input.breakMin * 60_000;
  const blocked: Interval[] = [
    ...input.busy,
    ...input.focusBlocks.map((f) => ({
      start: new Date(f.start.getTime() - breakMs),
      end: new Date(f.end.getTime() + breakMs),
    })),
  ];
  const floor = roundUp(new Date(Math.max(input.now.getTime(), input.notBefore?.getTime() ?? 0)));

  const windows = input.windows
    .map((w) => windowInstants(w, input.day, input.timeZone, rollover))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const w of windows) {
    let start = roundUp(new Date(Math.max(w.start.getTime(), floor.getTime())));
    for (;;) {
      const end = new Date(start.getTime() + blockMs);
      if (end > w.end) break;
      const clash = blocked.find((b) => b.start < end && b.end > start);
      if (!clash) return { start, end };
      start = roundUp(clash.end);
    }
  }
  return null;
}

/** Several consecutive slots (e.g. 2 × 45 min with 15 min breaks). */
export function nextSlots(input: SlotInput, count: number): Interval[] {
  const out: Interval[] = [];
  let notBefore = input.notBefore;
  for (let i = 0; i < count; i++) {
    const slot = nextSlot({ ...input, focusBlocks: [...input.focusBlocks, ...out], notBefore });
    if (!slot) break;
    out.push(slot);
    notBefore = slot.end;
  }
  return out;
}
