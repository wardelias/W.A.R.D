import { daysBetween, weekday, type IsoDate } from "@/domain/day";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 6 Oct" */
export function formatDate(date: IsoDate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1]}`;
}

/** "Today", "Tomorrow", "Yesterday", a weekday within the coming week, else "Thu 15 Oct". */
export function formatRelativeDay(date: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return WEEKDAYS[weekday(date)];
  return formatDate(date);
}

/** "45m", "1h 30m", "6h", "0m" */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
}

/** "11:00–11:45" in a time zone, 24-hour. */
export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  return `${formatClock(start, timeZone)}–${formatClock(end, timeZone)}`;
}

export function formatClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(instant);
}
