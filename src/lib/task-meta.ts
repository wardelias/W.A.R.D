import type { IsoDate } from "@/domain/day";
import { formatMinutes, formatRelativeDay } from "@/lib/format";

type TaskLike = {
  estMin: number | null;
  plannedFor: IsoDate | null;
  dueOn: IsoDate | null;
  slipCount: number;
  goal: { label: string };
};

/** "Grades · 90m · Today · due Thu · slipped 2×" (parts omitted when empty). */
export function taskMeta(
  task: TaskLike,
  today: IsoDate,
  options: { goal?: boolean; planned?: boolean } = {},
): string[] {
  const { goal = true, planned = true } = options;
  const parts: string[] = [];
  if (goal) parts.push(task.goal.label);
  if (task.estMin) parts.push(formatMinutes(task.estMin));
  if (planned && task.plannedFor) {
    const overdue = task.plannedFor < today;
    parts.push(
      overdue
        ? `planned ${formatRelativeDay(task.plannedFor, today)}`
        : formatRelativeDay(task.plannedFor, today),
    );
  }
  if (task.dueOn) parts.push(`due ${formatRelativeDay(task.dueOn, today)}`);
  if (task.slipCount > 0) parts.push(`slipped ${task.slipCount}×`);
  return parts;
}
