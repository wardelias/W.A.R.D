"use client";

import { useState, useTransition } from "react";
import { Button, Label, Notice } from "@/components/ui";
import { saveScheduleAction } from "@/server/actions/settings";

export type ScheduleValues = {
  timezone: string;
  wakeTime: string;
  shutdownTime: string;
  dayRollover: string;
  weekStart: number;
  focusWindows: { start: string; end: string }[];
  focusBlockMin: number;
  breakMin: number;
  capacityMin: number;
  blockReminders: boolean;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const input = "min-h-11 rounded-md border border-line bg-bg px-3 text-fg";

export function ScheduleForm({
  initial,
  timeZones,
  submitLabel = "Save",
  onSaved,
}: {
  initial: ScheduleValues;
  timeZones: string[];
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const set = <K extends keyof ScheduleValues>(key: K, value: ScheduleValues[K]) =>
    setV({ ...v, [key]: value });

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveScheduleAction(v);
      if (!result.ok) setMessage(result.error);
      else if (onSaved) onSaved();
      else setMessage("Saved.");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="tz">Time zone</Label>
        <select
          id="tz"
          value={v.timezone}
          onChange={(e) => set("timezone", e.target.value)}
          className={`${input} w-full`}
        >
          {timeZones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="wake">Wake</Label>
          <input
            id="wake"
            type="time"
            value={v.wakeTime}
            onChange={(e) => set("wakeTime", e.target.value)}
            className={`${input} w-full`}
          />
        </div>
        <div>
          <Label htmlFor="shutdown">Shutdown</Label>
          <input
            id="shutdown"
            type="time"
            value={v.shutdownTime}
            onChange={(e) => set("shutdownTime", e.target.value)}
            className={`${input} w-full`}
          />
        </div>
        <div>
          <Label htmlFor="rollover">Day ends at</Label>
          <input
            id="rollover"
            type="time"
            value={v.dayRollover}
            onChange={(e) => set("dayRollover", e.target.value)}
            className={`${input} w-full`}
          />
        </div>
      </div>
      <p className="-mt-3 text-sm text-muted">
        Until {v.dayRollover} it still counts as the day before, so a late shutdown lands on the
        right day.
      </p>

      <fieldset>
        <legend className="mb-1 text-sm text-muted">
          Focus windows (where focus blocks are suggested)
        </legend>
        <ul className="space-y-2">
          {v.focusWindows.map((w, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="time"
                aria-label={`Window ${i + 1} start`}
                value={w.start}
                onChange={(e) =>
                  set(
                    "focusWindows",
                    v.focusWindows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                  )
                }
                className={input}
              />
              <span>–</span>
              <input
                type="time"
                aria-label={`Window ${i + 1} end`}
                value={w.end}
                onChange={(e) =>
                  set(
                    "focusWindows",
                    v.focusWindows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                  )
                }
                className={input}
              />
              {v.focusWindows.length > 1 ? (
                <Button
                  variant="quiet"
                  aria-label={`Remove window ${i + 1}`}
                  onClick={() =>
                    set(
                      "focusWindows",
                      v.focusWindows.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {v.focusWindows.length < 4 ? (
          <Button
            variant="quiet"
            className="-ms-3 mt-1"
            onClick={() =>
              set("focusWindows", [...v.focusWindows, { start: "09:00", end: "10:00" }])
            }
          >
            + Add window
          </Button>
        ) : null}
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="block">Focus (min)</Label>
          <input
            id="block"
            type="number"
            inputMode="numeric"
            min={15}
            max={180}
            step={5}
            value={v.focusBlockMin}
            onChange={(e) => set("focusBlockMin", Number(e.target.value))}
            className={`${input} w-full`}
            dir="ltr"
          />
        </div>
        <div>
          <Label htmlFor="break">Break (min)</Label>
          <input
            id="break"
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            step={5}
            value={v.breakMin}
            onChange={(e) => set("breakMin", Number(e.target.value))}
            className={`${input} w-full`}
            dir="ltr"
          />
        </div>
        <div>
          <Label htmlFor="capacity">Capacity (h/day)</Label>
          <input
            id="capacity"
            type="number"
            inputMode="decimal"
            min={1}
            max={12}
            step={0.5}
            value={v.capacityMin / 60}
            onChange={(e) => set("capacityMin", Math.round(Number(e.target.value) * 60))}
            className={`${input} w-full`}
            dir="ltr"
          />
        </div>
      </div>
      <p className="-mt-3 text-sm text-muted">
        W.A.R.D. warns when a day plans more deep focus than this.
      </p>

      <div>
        <Label htmlFor="week">Week starts on</Label>
        <select
          id="week"
          value={v.weekStart}
          onChange={(e) => set("weekStart", Number(e.target.value))}
          className={input}
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5"
          checked={v.blockReminders}
          onChange={(e) => set("blockReminders", e.target.checked)}
        />
        <span>
          Google Calendar popup when a block starts
          <span className="block text-sm text-muted">
            Works on both phones without notifications from W.A.R.D.
          </span>
        </span>
      </label>

      {message ? <Notice>{message}</Notice> : null}
      <Button variant="primary" disabled={pending} onClick={save}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
