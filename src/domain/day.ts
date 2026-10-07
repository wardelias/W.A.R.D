import { Temporal } from "temporal-polyfill";

/**
 * Days and times. Dates are ISO strings "YYYY-MM-DD"; wall-clock times are
 * "HH:MM" (or "HH:MM:SS" as Postgres returns them). Instants are Date objects.
 *
 * A "logical day" ends at the rollover time (default 04:00), not midnight,
 * so a 00:40 shutdown still belongs to the day before.
 */

export type IsoDate = string;
export type WallTime = string;

export function parseTime(time: WallTime): Temporal.PlainTime {
  return Temporal.PlainTime.from(time.length === 5 ? `${time}:00` : time);
}

export function formatTime(time: Temporal.PlainTime): WallTime {
  return time.toString({ smallestUnit: "minute" });
}

/** The logical day an instant belongs to, in a time zone with a rollover time. */
export function logicalDay(instant: Date, timeZone: string, rollover: WallTime = "04:00"): IsoDate {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timeZone,
  );
  const date = zoned.toPlainDate();
  const beforeRollover = Temporal.PlainTime.compare(zoned.toPlainTime(), parseTime(rollover)) < 0;
  return (beforeRollover ? date.subtract({ days: 1 }) : date).toString();
}

/**
 * The instant of a wall-clock time on a calendar date in a time zone.
 * DST gaps resolve forward ("compatible"), like most calendars do.
 */
export function zonedInstant(date: IsoDate, time: WallTime, timeZone: string): Date {
  const zoned = Temporal.PlainDate.from(date).toZonedDateTime({
    timeZone,
    plainTime: parseTime(time),
  });
  return new Date(zoned.epochMilliseconds);
}

/**
 * Wall-clock time on a *logical* day. Times before the rollover belong to the
 * following calendar date (e.g. 01:00 on logical Tue is Wed 01:00).
 */
export function logicalInstant(
  day: IsoDate,
  time: WallTime,
  timeZone: string,
  rollover: WallTime = "04:00",
): Date {
  const t = parseTime(time);
  const calendarDate =
    Temporal.PlainTime.compare(t, parseTime(rollover)) < 0 ? addDays(day, 1) : day;
  return zonedInstant(calendarDate, time, timeZone);
}

/** [start, end) instants of a logical day. */
export function dayBounds(
  day: IsoDate,
  timeZone: string,
  rollover: WallTime = "04:00",
): { start: Date; end: Date } {
  return {
    start: zonedInstant(day, rollover, timeZone),
    end: zonedInstant(addDays(day, 1), rollover, timeZone),
  };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b), { largestUnit: "day" }).days;
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function weekday(date: IsoDate): number {
  return Temporal.PlainDate.from(date).dayOfWeek % 7;
}

/** First day of the week containing `date`, for a week starting on `weekStart` (0 = Sunday). */
export function startOfWeek(date: IsoDate, weekStart: number): IsoDate {
  const offset = (weekday(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(a), Temporal.PlainDate.from(b));
}

/** Inclusive list of dates from `from` to `to`. Empty when to < from. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Local wall-clock time of an instant, "HH:MM". */
export function localTime(instant: Date, timeZone: string): WallTime {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timeZone,
  );
  return formatTime(zoned.toPlainTime());
}

/** Minutes between two instants, rounded down. */
export function minutesBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 60_000);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}
