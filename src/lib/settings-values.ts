import type { Settings } from "@/server/context";
import type { ScheduleValues } from "@/components/settings/schedule-form";

export function scheduleValues(s: Settings): ScheduleValues {
  return {
    timezone: s.timezone,
    wakeTime: s.wake_time.slice(0, 5),
    shutdownTime: s.shutdown_time.slice(0, 5),
    dayRollover: s.day_rollover.slice(0, 5),
    weekStart: s.week_start,
    focusWindows: s.focus_windows,
    focusBlockMin: s.focus_block_min,
    breakMin: s.break_min,
    capacityMin: s.focus_capacity_min,
    blockReminders: s.block_reminders,
  };
}

export function timeZoneList(): string[] {
  return Intl.supportedValuesOf("timeZone");
}
