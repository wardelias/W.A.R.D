"use client";

import { useActionState, useState } from "react";
import { Chips } from "@/components/chips";
import { Button, cx, Label, Notice, TextField, UserText } from "@/components/ui";
import { DAY_NAMES } from "@/lib/habit-meta";
import type { ActionResult } from "@/server/actions/run";
import { saveHabitAction } from "@/server/actions/habits";

type Goal = { id: string; label: string };
type Kind = "daily" | "days" | "per_week";

export type HabitFormValues = {
  id?: string;
  name: string;
  minimumVersion: string;
  goalId: string;
  scheduleKind: Kind;
  scheduleDays: number[];
  perWeek: number | null;
  targetTime: string | null;
  blockMin: number | null;
  strict: boolean;
};

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function HabitForm({ goals, initial }: { goals: Goal[]; initial: HabitFormValues }) {
  const [state, action, saving] = useActionState<ActionResult | null, FormData>(
    saveHabitAction,
    null,
  );
  const [name, setName] = useState(initial.name);
  const [goalId, setGoalId] = useState(initial.goalId);
  const [kind, setKind] = useState<Kind>(initial.scheduleKind);
  const [days, setDays] = useState<number[]>(initial.scheduleDays);
  const [perWeek, setPerWeek] = useState(String(initial.perWeek ?? 3));
  const [time, setTime] = useState(initial.targetTime ?? "");
  const [block, setBlock] = useState(initial.blockMin ? String(initial.blockMin) : "");
  const [strict, setStrict] = useState(initial.strict);

  const blockActive = Boolean(time && block && kind !== "per_week");
  const scheduleText =
    kind === "daily"
      ? "every day"
      : kind === "days"
        ? days.map((d) => DAY_NAMES[d]).join(" ") || "the chosen days"
        : "";

  return (
    <form action={action} className="space-y-6">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="scheduleKind" value={kind} />
      {kind === "days"
        ? days.map((d) => <input key={d} type="hidden" name="scheduleDays" value={d} />)
        : null}
      {kind === "per_week" ? <input type="hidden" name="perWeek" value={perWeek} /> : null}
      <input type="hidden" name="blockMin" value={blockActive ? block : ""} />

      <div>
        <Label htmlFor="name">Name</Label>
        <TextField
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
        />
      </div>

      <Chips
        legend="Goal"
        options={goals.map((g) => ({ value: g.id, label: g.label }))}
        value={goalId}
        onChange={setGoalId}
      />

      <div>
        <Label htmlFor="minimumVersion">Minimum version</Label>
        <TextField
          id="minimumVersion"
          name="minimumVersion"
          defaultValue={initial.minimumVersion}
          required
          maxLength={120}
          placeholder="What still counts on a bad day"
        />
        <p className="mt-1 text-sm text-muted">
          Required. It counts toward the streak, and the history shows it honestly.
        </p>
      </div>

      <div className="space-y-2">
        <Chips<Kind>
          legend="Repeat"
          options={[
            { value: "daily", label: "Daily" },
            { value: "days", label: "Days" },
            { value: "per_week", label: "N per week" },
          ]}
          value={kind}
          onChange={setKind}
        />
        {kind === "days" ? (
          <fieldset className="flex flex-wrap gap-1.5 ps-12">
            <legend className="sr-only">Days</legend>
            {DAY_NAMES.map((label, d) => {
              const on = days.includes(d);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                  className={cx(
                    "min-h-9 min-w-11 rounded-md border px-2 text-sm",
                    on ? "border-fg font-semibold" : "border-line text-muted",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </fieldset>
        ) : null}
        {kind === "per_week" ? (
          <div className="ps-12">
            <Chips
              legend="Times"
              options={["1", "2", "3", "4", "5", "6", "7"].map((n) => ({ value: n, label: n }))}
              value={perWeek}
              onChange={setPerWeek}
            />
          </div>
        ) : null}
      </div>

      <div>
        <Label htmlFor="targetTime">Time (optional)</Label>
        <input
          id="targetTime"
          name="targetTime"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="min-h-11 rounded-md border border-line bg-bg px-3"
        />
        <p className="mt-1 text-sm text-muted">Used for the nudge and the calendar block.</p>
      </div>

      {time && kind !== "per_week" ? (
        <Chips
          legend="Block"
          options={[
            { value: "", label: "Off" },
            { value: "30", label: "30m" },
            { value: "60", label: "60m" },
            { value: "90", label: "90m" },
          ]}
          value={block}
          onChange={setBlock}
        />
      ) : null}

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="strict"
          checked={strict}
          onChange={(e) => setStrict(e.target.checked)}
          className="size-5"
        />
        <span>
          Strict
          <span className="block text-sm text-muted">
            {strict
              ? "Any miss resets the streak."
              : "Default: one miss per week is forgiven, never two in a row."}
          </span>
        </span>
      </label>

      {blockActive ? (
        <Notice>
          Adds “<UserText>{name || "this habit"}</UserText>” {time}–
          {addMinutes(time, Number(block))} to your W.A.R.D. calendar on {scheduleText}, 7 days
          ahead, rolling. Blocks are created once Google Calendar is connected.
        </Notice>
      ) : null}

      {state && !state.ok ? <Notice>{state.error}</Notice> : null}
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? "Saving…" : blockActive ? "Save and add blocks" : "Save"}
      </Button>
    </form>
  );
}
