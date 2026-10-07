"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Chips } from "@/components/chips";
import { Button, buttonClass, Notice } from "@/components/ui";
import { addFocusBlocksAction } from "@/server/actions/blocks";

export function AddFocusBlocks({
  taskId,
  goals,
  starts,
  minutes,
  returnTo,
}: {
  taskId: string | null;
  goals: { id: string; label: string }[];
  starts: string[];
  minutes: number;
  returnTo: string;
}) {
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6 space-y-3">
      {goals.length ? (
        <Chips
          legend="Goal"
          options={goals.map((g) => ({ value: g.id, label: g.label }))}
          value={goalId}
          onChange={setGoalId}
        />
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={pending || starts.length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await addFocusBlocksAction({
                taskId,
                goalId: taskId ? null : goalId,
                starts,
                minutes,
                returnTo,
              });
              if (!result.ok) setError(result.error);
            })
          }
        >
          {pending
            ? "Adding…"
            : starts.length === 1
              ? "Add 1 block"
              : `Add ${starts.length} blocks`}
        </Button>
        <Link href={returnTo} className={buttonClass("plain")}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
