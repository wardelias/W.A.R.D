"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GoalsForm } from "@/components/settings/goals-form";
import { ScheduleForm, type ScheduleValues } from "@/components/settings/schedule-form";
import { Button, Notice } from "@/components/ui";
import { addStarterHabitsAction } from "@/server/actions/welcome";
import { finishOnboardingAction } from "@/server/actions/settings";

export function ScheduleStep({
  initial,
  timeZones,
}: {
  initial: ScheduleValues;
  timeZones: string[];
}) {
  const router = useRouter();
  return (
    <ScheduleForm
      initial={initial}
      timeZones={timeZones}
      submitLabel="Looks right"
      onSaved={() => router.push("/welcome?step=2")}
    />
  );
}

export function GoalsStep({
  initial,
}: {
  initial: { id: string; title: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <GoalsForm
      initial={initial}
      submitLabel="Next"
      onSaved={() => router.push("/welcome?step=3")}
    />
  );
}

const STARTERS = [
  { key: "gym", name: "Gym", minimum: "10 push-ups at home", rank: 3 },
  { key: "read", name: "Read 20 min", minimum: "1 page", rank: 1 },
  { key: "lunch", name: "Lunch by 15:30", minimum: "Any real meal", rank: 3 },
] as const;

export function FirstHabits({ goals }: { goals: { id: string; rank: number }[] }) {
  const [picked, setPicked] = useState<string[]>(["gym", "read"]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function finish(withHabits: boolean) {
    setError(null);
    startTransition(async () => {
      if (withHabits && picked.length) {
        const result = await addStarterHabitsAction(
          STARTERS.filter((s) => picked.includes(s.key)).map((s) => ({
            name: s.name,
            minimumVersion: s.minimum,
            goalId: goals.find((g) => g.rank === s.rank)?.id ?? goals[0].id,
          })),
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      await finishOnboardingAction();
    });
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {STARTERS.map((s) => (
          <li key={s.key}>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={picked.includes(s.key)}
                onChange={(e) =>
                  setPicked(
                    e.target.checked ? [...picked, s.key] : picked.filter((k) => k !== s.key),
                  )
                }
              />
              <span>
                {s.name}
                <span className="block text-sm text-muted">min: {s.minimum} · daily</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending} onClick={() => finish(true)}>
          {picked.length ? "Add selected and start" : "Start"}
        </Button>
        <Button disabled={pending} onClick={() => finish(false)}>
          Skip
        </Button>
      </div>
    </div>
  );
}
