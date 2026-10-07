import type { IsoDate } from "./day";

/**
 * Planned deep work and overload (plan §5.3).
 *
 * plannedDeep(day) = minutes of focus blocks on that day (not skipped)
 *                  + est_min of open tasks planned that day with no focus block that day.
 * Habit blocks and outside calendar events never count.
 */

export type LoadBlock = {
  id: string;
  minutes: number;
  startsAt: Date;
  taskId: string | null;
  /** 1 = Grades … 3 = Health; null for blocks created directly in Google without a goal. */
  goalRank: number | null;
  outcome: "done" | "partial" | "skipped" | null;
  title: string;
};

export type LoadTask = {
  id: string;
  estMin: number | null;
  goalRank: number;
  title: string;
};

export type DayLoad = {
  day: IsoDate;
  /** Focus blocks on the day (not deleted). */
  blocks: LoadBlock[];
  /** Open tasks planned for the day. */
  tasks: LoadTask[];
};

export type LoadSummary = {
  plannedMin: number;
  blockMin: number;
  unblockedTaskMin: number;
  hasPlan: boolean;
  hasPriorityOne: boolean;
};

export function summarize(load: DayLoad): LoadSummary {
  const counted = load.blocks.filter((b) => b.outcome !== "skipped");
  const blockMin = counted.reduce((sum, b) => sum + b.minutes, 0);
  const blockedTasks = new Set(counted.map((b) => b.taskId).filter(Boolean));
  const unblockedTaskMin = load.tasks
    .filter((t) => !blockedTasks.has(t.id))
    .reduce((sum, t) => sum + (t.estMin ?? 0), 0);
  const hasPriorityOne =
    counted.some((b) => b.goalRank === 1) || load.tasks.some((t) => t.goalRank === 1);
  return {
    plannedMin: blockMin + unblockedTaskMin,
    blockMin,
    unblockedTaskMin,
    hasPlan: counted.length > 0 || load.tasks.length > 0,
    hasPriorityOne,
  };
}

export type DayCheck = LoadSummary & {
  capacityMin: number;
  /** Minutes above capacity, 0 when within it. */
  overBy: number;
  /** The day has a plan but no Grades (priority 1) work. */
  noPriorityOne: boolean;
};

export function checkDay(load: DayLoad, capacityMin: number): DayCheck {
  const s = summarize(load);
  return {
    ...s,
    capacityMin,
    overBy: Math.max(0, s.plannedMin - capacityMin),
    noPriorityOne: s.hasPlan && !s.hasPriorityOne,
  };
}

/** Something the overload fix can move to another day. */
export type MoveItem =
  | {
      kind: "task";
      taskId: string;
      blockIds: string[];
      minutes: number;
      goalRank: number;
      title: string;
    }
  | { kind: "block"; blockId: string; minutes: number; goalRank: number | null; title: string };

export type Move = { item: MoveItem; toDay: IsoDate | null };

export type OverloadFix = {
  overBy: number;
  moves: Move[];
  /** True when the moves bring the day within capacity and every move has a day. */
  fixed: boolean;
};

/**
 * Items that can still move: tasks whose blocks that day are all in the
 * future and not done, and standalone future blocks. Done or past work stays.
 */
export function movableItems(load: DayLoad, now: Date): MoveItem[] {
  const future = (b: LoadBlock) => b.startsAt > now && b.outcome === null;
  const items: MoveItem[] = [];
  const blocksByTask = new Map<string, LoadBlock[]>();
  for (const b of load.blocks) {
    if (b.outcome === "skipped") continue;
    if (b.taskId) blocksByTask.set(b.taskId, [...(blocksByTask.get(b.taskId) ?? []), b]);
  }
  for (const t of load.tasks) {
    const blocks = blocksByTask.get(t.id) ?? [];
    if (!blocks.every(future)) continue;
    const minutes = blocks.length ? blocks.reduce((s, b) => s + b.minutes, 0) : (t.estMin ?? 0);
    if (minutes <= 0) continue;
    items.push({
      kind: "task",
      taskId: t.id,
      blockIds: blocks.map((b) => b.id),
      minutes,
      goalRank: t.goalRank,
      title: t.title,
    });
  }
  const plannedTaskIds = new Set(load.tasks.map((t) => t.id));
  for (const b of load.blocks) {
    if (b.outcome === "skipped" || !future(b)) continue;
    if (b.taskId && plannedTaskIds.has(b.taskId)) continue; // moves with its task
    items.push({
      kind: "block",
      blockId: b.id,
      minutes: b.minutes,
      goalRank: b.goalRank,
      title: b.title,
    });
  }
  return items;
}

const rankOf = (item: MoveItem) => item.goalRank ?? 4; // untagged moves first

/**
 * Proposes the fewest, lowest-ladder moves that bring `days[index]` within
 * capacity, each to the next later day in `days` with room for it.
 */
export function suggestOverloadFix(
  days: DayLoad[],
  index: number,
  capacityMin: number,
  now: Date,
): OverloadFix {
  const overBy = checkDay(days[index], capacityMin).overBy;
  if (overBy === 0) return { overBy, moves: [], fixed: true };

  const pool = movableItems(days[index], now).sort((a, b) => rankOf(b) - rankOf(a));
  const chosen: MoveItem[] = [];
  let remaining = overBy;
  while (remaining > 0 && pool.length > 0) {
    const lowest = rankOf(pool[0]);
    const sameRank = pool.filter((i) => rankOf(i) === lowest);
    const single = sameRank
      .filter((i) => i.minutes >= remaining)
      .sort((a, b) => a.minutes - b.minutes)[0];
    const pick = single ?? sameRank.sort((a, b) => b.minutes - a.minutes)[0];
    chosen.push(pick);
    remaining -= pick.minutes;
    pool.splice(pool.indexOf(pick), 1);
  }

  const extra = new Map<number, number>();
  const moves: Move[] = chosen.map((item) => {
    for (let j = index + 1; j < days.length; j++) {
      const load = checkDay(days[j], capacityMin).plannedMin + (extra.get(j) ?? 0);
      if (load + item.minutes <= capacityMin) {
        extra.set(j, (extra.get(j) ?? 0) + item.minutes);
        return { item, toDay: days[j].day };
      }
    }
    return { item, toDay: null };
  });

  return { overBy, moves, fixed: remaining <= 0 && moves.every((m) => m.toDay !== null) };
}
