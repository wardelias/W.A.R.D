import type { DayCheck, OverloadFix } from "@/domain/capacity";
import type { IsoDate } from "@/domain/day";
import { isolate } from "@/domain/text";
import { formatMinutes, formatRelativeDay } from "@/lib/format";

/** "Move “X” (30m) to Wed and “Y” (45m) to Thu?" — always a concrete proposal. */
export function fixSentence(fix: OverloadFix, today: IsoDate): string {
  const moves = fix.moves.filter((m) => m.toDay);
  if (moves.length === 0) return "No day in the coming week has room. Drop or shrink something.";
  const parts = moves.map((m) => {
    const blocks = m.item.kind === "block" ? 1 : m.item.blockIds.length;
    const what =
      m.item.kind === "block"
        ? `focus block “${isolate(m.item.title)}”`
        : `“${isolate(m.item.title)}”${blocks ? ` with its ${blocks === 1 ? "focus block" : `${blocks} focus blocks`}` : ""}`;
    return `${what} (${formatMinutes(m.item.minutes)}) to ${formatRelativeDay(m.toDay!, today)}`;
  });
  const touchesCalendar = moves.some((m) => m.item.kind === "block" || m.item.blockIds.length > 0);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `Move ${list}?${touchesCalendar ? " This updates Google Calendar “W.A.R.D.”." : ""}${fix.fixed ? "" : " Still over after that."}`;
}

export function planLines(check: DayCheck, dayLabel = "today"): string[] {
  const lines: string[] = [];
  if (check.overBy > 0) {
    lines.push(
      `Focus planned ${formatMinutes(check.plannedMin)} of ${formatMinutes(check.capacityMin)}. Over by ${formatMinutes(check.overBy)}.`,
    );
  }
  if (check.noPriorityOne) lines.push(`No Grades work planned ${dayLabel}.`);
  return lines;
}

export function fixMoveIds(fix: OverloadFix | null): string[] {
  return (fix?.moves ?? [])
    .filter((m) => m.toDay)
    .map((m) => (m.item.kind === "task" ? m.item.taskId : m.item.blockId));
}
