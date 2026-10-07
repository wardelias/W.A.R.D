import { describe, expect, it } from "vitest";
import {
  checkDay,
  movableItems,
  suggestOverloadFix,
  summarize,
  type DayLoad,
  type LoadBlock,
  type LoadTask,
} from "@/domain/capacity";

const NOW = new Date("2026-10-07T07:00:00Z"); // 10:00 in Jerusalem
const later = (h: number) => new Date(`2026-10-07T${String(h).padStart(2, "0")}:00:00Z`);

let n = 0;
const block = (over: Partial<LoadBlock> = {}): LoadBlock => ({
  id: `b${++n}`,
  minutes: 45,
  startsAt: later(9),
  taskId: null,
  goalRank: 1,
  outcome: null,
  title: "Focus",
  ...over,
});
const task = (over: Partial<LoadTask> = {}): LoadTask => ({
  id: `t${++n}`,
  estMin: 60,
  goalRank: 1,
  title: "Task",
  ...over,
});
const day = (d: string, blocks: LoadBlock[] = [], tasks: LoadTask[] = []): DayLoad => ({
  day: d,
  blocks,
  tasks,
});

describe("summarize / checkDay", () => {
  it("adds focus blocks and the estimates of tasks without a block", () => {
    const t1 = task({ id: "t1", estMin: 90 });
    const t2 = task({ id: "t2", estMin: 30 });
    const load = day("2026-10-07", [block({ taskId: "t1" }), block({ taskId: "t1" })], [t1, t2]);
    const s = summarize(load);
    expect(s.blockMin).toBe(90);
    expect(s.unblockedTaskMin).toBe(30); // t1 is covered by its blocks
    expect(s.plannedMin).toBe(120);
  });

  it("ignores skipped blocks and tasks without an estimate", () => {
    const load = day("2026-10-07", [block({ outcome: "skipped" })], [task({ estMin: null })]);
    expect(summarize(load).plannedMin).toBe(0);
  });

  it("a skipped block no longer covers its task", () => {
    const t1 = task({ id: "t1", estMin: 60 });
    const load = day("2026-10-07", [block({ taskId: "t1", outcome: "skipped" })], [t1]);
    expect(summarize(load).plannedMin).toBe(60);
  });

  it("reports minutes over capacity", () => {
    const load = day("2026-10-07", [], [task({ estMin: 300 }), task({ estMin: 105 })]);
    expect(checkDay(load, 360).overBy).toBe(45);
    expect(checkDay(load, 600).overBy).toBe(0);
  });

  it("flags a planned day with no Grades work, but not an empty day", () => {
    expect(checkDay(day("d", [], [task({ goalRank: 2 })]), 360).noPriorityOne).toBe(true);
    expect(checkDay(day("d", [], [task({ goalRank: 1 })]), 360).noPriorityOne).toBe(false);
    expect(checkDay(day("d"), 360).noPriorityOne).toBe(false);
  });
});

describe("movableItems", () => {
  it("a task moves with its future blocks; past or done work stays", () => {
    const t1 = task({ id: "t1" });
    const t2 = task({ id: "t2" });
    const load = day(
      "2026-10-07",
      [
        block({ id: "f1", taskId: "t1", startsAt: later(9) }),
        block({ id: "p1", taskId: "t2", startsAt: later(6) }), // already started
      ],
      [t1, t2],
    );
    const items = movableItems(load, NOW);
    expect(items).toEqual([
      expect.objectContaining({ kind: "task", taskId: "t1", blockIds: ["f1"], minutes: 45 }),
    ]);
  });

  it("tasks without an estimate or blocks have nothing to move", () => {
    expect(movableItems(day("2026-10-07", [], [task({ estMin: null })]), NOW)).toEqual([]);
  });

  it("a block for a task planned another day moves on its own", () => {
    const load = day("2026-10-07", [block({ id: "o1", taskId: "elsewhere" })]);
    expect(movableItems(load, NOW)).toEqual([
      expect.objectContaining({ kind: "block", blockId: "o1" }),
    ]);
  });

  it("skipped blocks are neither counted nor moved", () => {
    const load = day("2026-10-07", [block({ outcome: "skipped" })]);
    expect(movableItems(load, NOW)).toEqual([]);
  });

  it("standalone future blocks are movable on their own", () => {
    const load = day("2026-10-07", [block({ id: "s1", goalRank: null })]);
    expect(movableItems(load, NOW)).toEqual([
      expect.objectContaining({ kind: "block", blockId: "s1", goalRank: null }),
    ]);
  });
});

describe("suggestOverloadFix", () => {
  it("returns nothing to do within capacity", () => {
    const fix = suggestOverloadFix([day("2026-10-07", [], [task({ estMin: 60 })])], 0, 360, NOW);
    expect(fix).toEqual({ overBy: 0, moves: [], fixed: true });
  });

  it("moves the lowest-ladder item that covers the overage to the next day with room", () => {
    const grades = task({ id: "g", estMin: 300, goalRank: 1 });
    const agencySmall = task({ id: "a1", estMin: 30, goalRank: 2 });
    const agencyBig = task({ id: "a2", estMin: 60, goalRank: 2 });
    const health = task({ id: "h", estMin: 20, goalRank: 3 });
    const days = [
      day("2026-10-07", [], [grades, agencySmall, agencyBig, health]), // 410 → over by 50
      day("2026-10-08", [], [task({ estMin: 340 })]), // full
      day("2026-10-09", [], [task({ estMin: 120 })]),
    ];
    const fix = suggestOverloadFix(days, 0, 360, NOW);
    expect(fix.overBy).toBe(50);
    // Health (20) first, then the smallest Agency item covering the remaining 30
    expect(fix.moves.map((m) => [m.item.kind === "task" && m.item.taskId, m.toDay])).toEqual([
      ["h", "2026-10-08"],
      ["a1", "2026-10-09"],
    ]);
    expect(fix.fixed).toBe(true);
  });

  it("never touches priority-1 work while lower-ladder items can cover it", () => {
    const days = [
      day(
        "2026-10-07",
        [],
        [task({ id: "g", estMin: 330, goalRank: 1 }), task({ id: "h", estMin: 60, goalRank: 3 })],
      ),
      day("2026-10-08"),
    ];
    const fix = suggestOverloadFix(days, 0, 360, NOW);
    expect(fix.moves.map((m) => m.item.kind === "task" && m.item.taskId)).toEqual(["h"]);
  });

  it("takes the biggest low-ladder item first when none covers the overage alone", () => {
    const days = [
      day(
        "2026-10-07",
        [],
        [
          task({ id: "g", estMin: 360, goalRank: 1 }),
          task({ id: "h1", estMin: 20, goalRank: 3 }),
          task({ id: "h2", estMin: 30, goalRank: 3 }),
        ],
      ),
      day("2026-10-08"),
    ];
    const fix = suggestOverloadFix(days, 0, 360, NOW);
    expect(fix.moves.map((m) => m.item.kind === "task" && m.item.taskId)).toEqual(["h2", "h1"]);
  });

  it("reports when no later day has room", () => {
    const days = [
      day("2026-10-07", [], [task({ id: "x", estMin: 420, goalRank: 2 })]),
      day("2026-10-08", [], [task({ estMin: 360 })]),
    ];
    const fix = suggestOverloadFix(days, 0, 360, NOW);
    expect(fix.moves).toEqual([expect.objectContaining({ toDay: null })]);
    expect(fix.fixed).toBe(false);
  });

  it("can't fix a day whose overload is all past or done work", () => {
    const days = [
      day("2026-10-07", [
        block({ minutes: 240, startsAt: later(5), outcome: "done" }),
        block({ minutes: 180, startsAt: later(6) }),
      ]),
      day("2026-10-08"),
    ];
    const fix = suggestOverloadFix(days, 0, 360, NOW);
    expect(fix.moves).toEqual([]);
    expect(fix.fixed).toBe(false);
  });
});
