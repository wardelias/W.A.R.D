"use client";

import { useState, useTransition } from "react";
import { Button, cx, Notice, Section } from "@/components/ui";
import { deleteBlockAction, moveBlockAction, setBlockOutcomeAction } from "@/server/actions/blocks";

type Outcome = "done" | "partial" | "skipped";

/** Converts a local date + time in the user's zone to an ISO instant (client side). */
function toInstant(day: string, time: string, timeZone: string): string {
  // Interpret as UTC first, then correct by the zone's offset at that moment.
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}

function clock(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function BlockActions({
  id,
  label,
  started,
  outcome,
  day,
  time,
  currentText,
  nextFree,
  calendarName,
  timeZone,
  minutes,
}: {
  id: string;
  label: string;
  started: boolean;
  outcome: Outcome | null;
  day: string;
  time: string;
  currentText: string;
  nextFree: { iso: string; text: string } | null;
  calendarName: string | null;
  timeZone: string;
  minutes: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Outcome | null>(outcome);
  const [newDay, setNewDay] = useState(day);
  const [newTime, setNewTime] = useState(time);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);

  const target = newDay && newTime ? toInstant(newDay, newTime, timeZone) : null;
  const targetEnd = target
    ? new Date(new Date(target).getTime() + minutes * 60_000).toISOString()
    : null;
  const changed = newDay !== day || newTime !== time;
  const where = calendarName ? ` in ${calendarName}` : "";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else after?.();
    });
  }

  return (
    <div>
      {started ? (
        <Section title="How did it go?">
          <div className="flex gap-2">
            {(["done", "partial", "skipped"] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={current === o}
                disabled={pending}
                onClick={() =>
                  run(
                    () => setBlockOutcomeAction(id, o),
                    () => setCurrent(o),
                  )
                }
                className={cx(
                  "min-h-10 rounded-md border px-3 text-sm capitalize",
                  current === o ? "border-fg font-semibold" : "border-line text-muted",
                )}
              >
                {o}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Move">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-muted">
            Day
            <input
              type="date"
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
              className="mt-1 block min-h-11 rounded-md border border-line bg-bg px-3 text-fg"
            />
          </label>
          <label className="text-sm text-muted">
            Time
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="mt-1 block min-h-11 rounded-md border border-line bg-bg px-3 text-fg"
            />
          </label>
          {nextFree ? (
            <Button
              onClick={() => {
                const d = new Date(nextFree.iso);
                setNewDay(day);
                setNewTime(clock(d.toISOString(), timeZone));
              }}
            >
              Next free slot ({nextFree.text})
            </Button>
          ) : null}
        </div>
        {changed && target && targetEnd ? (
          <Notice className="mt-3">
            <p>
              Moves “<bdi>{label}</bdi>” from {currentText} to {newDay} {clock(target, timeZone)}–
              {clock(targetEnd, timeZone)}
              {where}.
            </p>
            <div className="mt-2">
              <Button
                variant="primary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => moveBlockAction(id, target),
                    () => setMoved(`Moved to ${newDay} ${clock(target, timeZone)}.`),
                  )
                }
              >
                Move
              </Button>
            </div>
          </Notice>
        ) : null}
        {moved ? <p className="mt-2 text-sm">{moved}</p> : null}
      </Section>

      <Section title="Delete">
        {confirmDelete ? (
          <Notice>
            <p>
              Removes “<bdi>{label}</bdi>” ({currentText})
              {calendarName ? ` from ${calendarName}` : ""}.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => run(() => deleteBlockAction(id))}
              >
                Delete
              </Button>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </Notice>
        ) : (
          <Button onClick={() => setConfirmDelete(true)}>Delete…</Button>
        )}
      </Section>
      {error ? <Notice className="mt-4">{error}</Notice> : null}
    </div>
  );
}
