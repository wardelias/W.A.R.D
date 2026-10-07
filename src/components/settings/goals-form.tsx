"use client";

import { useState, useTransition } from "react";
import { Button, Notice, TextField } from "@/components/ui";
import { saveGoalsAction } from "@/server/actions/settings";

type Goal = { id: string; title: string; label: string };

/** The three-level ladder: names and order (first = priority 1). */
export function GoalsForm({
  initial,
  submitLabel = "Save",
  onSaved,
}: {
  initial: Goal[];
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const [goals, setGoals] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function move(i: number, by: number) {
    const next = [...goals];
    const [g] = next.splice(i, 1);
    next.splice(i + by, 0, g);
    setGoals(next);
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {goals.map((g, i) => (
          <li key={g.id} className="rounded-md border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted">Priority {i + 1}</span>
              <span className="flex gap-1">
                <Button
                  variant="quiet"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${g.label} up`}
                >
                  ↑
                </Button>
                <Button
                  variant="quiet"
                  disabled={i === goals.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${g.label} down`}
                >
                  ↓
                </Button>
              </span>
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <TextField
                aria-label={`Short label for priority ${i + 1}`}
                value={g.label}
                maxLength={12}
                onChange={(e) =>
                  setGoals(goals.map((x) => (x.id === g.id ? { ...x, label: e.target.value } : x)))
                }
              />
              <TextField
                aria-label={`Name for priority ${i + 1}`}
                value={g.title}
                maxLength={80}
                onChange={(e) =>
                  setGoals(goals.map((x) => (x.id === g.id ? { ...x, title: e.target.value } : x)))
                }
              />
            </div>
          </li>
        ))}
      </ol>
      {message ? <Notice>{message}</Notice> : null}
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await saveGoalsAction(goals);
            if (!result.ok) setMessage(result.error);
            else if (onSaved) onSaved();
            else setMessage("Saved.");
          })
        }
      >
        {pending ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
