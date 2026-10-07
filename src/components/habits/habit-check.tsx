"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { UserText } from "@/components/ui";
import { logHabitAction, unlogHabitAction } from "@/server/actions/habits";

export type HabitCheckData = {
  id: string;
  name: string;
  minimumVersion: string;
  level: "full" | "minimum" | null;
  neverMissTwice: boolean;
  /** Short plain-text details, e.g. "streak 6 · 16:00". */
  meta?: string;
};

/**
 * One tap logs a habit: Done, or the minimum version on a bad day.
 * Tapping Undo removes today's log.
 */
export function HabitCheck({ habit, day }: { habit: HabitCheckData; day?: string }) {
  const [level, setLevel] = useOptimistic(habit.level);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function log(next: "full" | "minimum" | null) {
    setError(null);
    startTransition(async () => {
      setLevel(next);
      const result = next
        ? await logHabitAction(habit.id, next, day)
        : await unlogHabitAction(habit.id, day);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="border-b border-line py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/habits/${habit.id}`} className="min-w-0 py-1">
          <span aria-hidden className="me-2 inline-block w-3 text-muted">
            {level ? "✓" : ""}
          </span>
          <UserText className="break-words">{habit.name}</UserText>
          {habit.meta ? <span className="ms-2 text-sm text-muted">{habit.meta}</span> : null}
        </Link>
        {level ? (
          <span className="flex shrink-0 items-baseline gap-2 text-sm text-muted">
            {level}
            <button
              type="button"
              onClick={() => log(null)}
              className="min-h-9 px-1 underline-offset-4 hover:underline"
              aria-label={`Undo ${habit.name}`}
            >
              Undo
            </button>
          </span>
        ) : null}
      </div>
      {!level ? (
        <div className="mt-1.5 flex flex-wrap gap-2 ps-5">
          {habit.neverMissTwice ? (
            <>
              <MinimumButton habit={habit} onClick={() => log("minimum")} primary />
              <LogButton label="Done" name={habit.name} onClick={() => log("full")} />
            </>
          ) : (
            <>
              <LogButton label="Done" name={habit.name} onClick={() => log("full")} />
              <MinimumButton habit={habit} onClick={() => log("minimum")} />
            </>
          )}
        </div>
      ) : null}
      {!level && habit.neverMissTwice ? (
        <p className="mt-1.5 ps-5 text-sm">
          Missed last time. Never miss twice — the minimum counts.
        </p>
      ) : null}
      {error ? <p className="mt-1 ps-5 text-sm">{error}</p> : null}
    </li>
  );
}

function LogButton({ label, name, onClick }: { label: string; name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${name}`}
      className="min-h-10 rounded-md border border-line px-3 text-sm font-medium"
    >
      {label}
    </button>
  );
}

function MinimumButton({
  habit,
  onClick,
  primary,
}: {
  habit: HabitCheckData;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Minimum: ${habit.name}`}
      className={
        primary
          ? "min-h-10 max-w-full rounded-md bg-accent px-3 text-start text-sm font-medium text-accent-fg"
          : "min-h-10 max-w-full rounded-md border border-line px-3 text-start text-sm"
      }
    >
      Min: <UserText>{habit.minimumVersion}</UserText>
    </button>
  );
}
