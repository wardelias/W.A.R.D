import type { Habit } from "@/server/services/habits";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleLabel(h: Pick<Habit, "scheduleKind" | "scheduleDays" | "perWeek">): string {
  if (h.scheduleKind === "daily") return "daily";
  if (h.scheduleKind === "per_week") return `${h.perWeek}× a week`;
  const days = h.scheduleDays ?? [];
  if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))) return "Sun–Thu";
  return days.map((d) => DAY_NAMES[d]).join(" ");
}

export function rateLabel(rate: number | null): string {
  return rate === null ? "30d —" : `30d ${Math.round(rate * 100)}%`;
}

export { DAY_NAMES };
