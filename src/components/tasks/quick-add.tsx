"use client";

import { useRef, useState, useTransition } from "react";
import { Chips } from "@/components/chips";
import { Notice, TextField } from "@/components/ui";
import { createTaskAction } from "@/server/actions/tasks";

type Goal = { id: string; label: string };
type When = "today" | "tomorrow" | "pick" | "later";

const LAST_GOAL_KEY = "ward:last-goal";
const TIME_OPTIONS = [
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "45", label: "45m" },
  { value: "90", label: "90m" },
  { value: "", label: "—" },
];

function readLastGoal(goals: Goal[]): string {
  try {
    const saved = window.localStorage.getItem(LAST_GOAL_KEY);
    if (saved && goals.some((g) => g.id === saved)) return saved;
  } catch {
    // storage unavailable: fall back to the first goal
  }
  return goals[0]?.id ?? "";
}

/**
 * One line to add a task. Choices appear once you start typing;
 * Enter saves with the highlighted ones.
 */
export function QuickAdd({
  goals,
  today,
  tomorrow,
  defaultWhen = "today",
}: {
  goals: Goal[];
  today: string;
  tomorrow: string;
  defaultWhen?: When;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // null until the user picks one; then the last goal used on this device is the default.
  const [goalChoice, setGoalChoice] = useState<string | null>(null);
  const [est, setEst] = useState("");
  const [when, setWhen] = useState<When>(defaultWhen);
  const [pickDate, setPickDate] = useState(tomorrow);
  const input = useRef<HTMLInputElement>(null);

  // Only read storage once the user has typed (never during server render).
  const goalId = goalChoice ?? (title ? readLastGoal(goals) : (goals[0]?.id ?? ""));

  function submit(formData: FormData) {
    setError(null);
    try {
      window.localStorage.setItem(LAST_GOAL_KEY, goalId);
    } catch {
      // storage unavailable
    }
    startTransition(async () => {
      const result = await createTaskAction(null, formData);
      if (result.ok) {
        setTitle("");
        input.current?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  const plannedFor =
    when === "today" ? today : when === "tomorrow" ? tomorrow : when === "pick" ? pickDate : "";

  return (
    <form action={submit} className="space-y-2">
      <label htmlFor="quick-add" className="sr-only">
        Add a task
      </label>
      <TextField
        ref={input}
        id="quick-add"
        name="title"
        placeholder="Add a task…"
        autoComplete="off"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={300}
        enterKeyHint="done"
      />
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="estMin" value={est} />
      <input type="hidden" name="plannedFor" value={plannedFor} />

      {title.trim() ? (
        <div className="space-y-2 pt-1">
          <Chips
            legend="Goal"
            options={goals.map((g) => ({ value: g.id, label: g.label }))}
            value={goalId}
            onChange={setGoalChoice}
          />
          <Chips legend="Time" options={TIME_OPTIONS} value={est} onChange={setEst} />
          <Chips<When>
            legend="When"
            options={[
              { value: "today", label: "Today" },
              { value: "tomorrow", label: "Tomorrow" },
              { value: "pick", label: "Pick day" },
              { value: "later", label: "Later" },
            ]}
            value={when}
            onChange={setWhen}
          />
          {when === "pick" ? (
            <div className="ps-12">
              <label htmlFor="quick-add-day" className="sr-only">
                Day
              </label>
              <input
                id="quick-add-day"
                type="date"
                min={today}
                value={pickDate}
                onChange={(e) => setPickDate(e.target.value)}
                className="min-h-9 rounded-md border border-line bg-bg px-2 text-sm"
              />
            </div>
          ) : null}
          <div className="flex items-center gap-3 ps-12">
            <button
              type="submit"
              disabled={pending}
              className="min-h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {pending ? "Saving…" : "Add"}
            </button>
            <span className="text-sm text-muted">or press Enter</span>
          </div>
        </div>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
    </form>
  );
}
