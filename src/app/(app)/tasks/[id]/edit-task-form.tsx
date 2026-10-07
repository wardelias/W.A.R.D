"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chips } from "@/components/chips";
import Link from "next/link";
import { Button, buttonClass, Label, Notice, TextArea, TextField } from "@/components/ui";
import type { ActionResult } from "@/server/actions/run";
import { setTaskStatusAction, updateTaskAction } from "@/server/actions/tasks";
import type { Task } from "@/server/services/tasks";

type Goal = { id: string; label: string };

export function EditTaskForm({
  task,
  goals,
  today,
  tomorrow,
  returnTo,
}: {
  task: Task;
  goals: Goal[];
  today: string;
  tomorrow: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [state, action, saving] = useActionState<ActionResult | null, FormData>(
    updateTaskAction,
    null,
  );
  const [goalId, setGoalId] = useState(task.goal.id);
  const [plannedFor, setPlannedFor] = useState(task.plannedFor ?? "");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [changing, startTransition] = useTransition();

  function setStatus(status: "open" | "done" | "dropped") {
    setStatusError(null);
    startTransition(async () => {
      const result = await setTaskStatusAction(task.id, status);
      if (!result.ok) setStatusError(result.error);
      else router.push(returnTo);
    });
  }

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-5">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="goalId" value={goalId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <Label htmlFor="title">Title</Label>
          <TextField id="title" name="title" defaultValue={task.title} required maxLength={300} />
        </div>
        <Chips
          legend="Goal"
          options={goals.map((g) => ({ value: g.id, label: g.label }))}
          value={goalId}
          onChange={setGoalId}
        />
        <div>
          <Label htmlFor="estMin">Estimate (minutes)</Label>
          <TextField
            id="estMin"
            name="estMin"
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            step={5}
            defaultValue={task.estMin ?? ""}
            dir="ltr"
            className="max-w-32"
          />
        </div>
        <div>
          <Label htmlFor="plannedFor">Planned for</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="plannedFor"
              name="plannedFor"
              type="date"
              value={plannedFor}
              onChange={(e) => setPlannedFor(e.target.value)}
              className="min-h-11 rounded-md border border-line bg-bg px-3"
            />
            <Button variant="quiet" onClick={() => setPlannedFor(today)}>
              Today
            </Button>
            <Button variant="quiet" onClick={() => setPlannedFor(tomorrow)}>
              Tomorrow
            </Button>
            <Button variant="quiet" onClick={() => setPlannedFor("")}>
              Later
            </Button>
          </div>
        </div>
        <div>
          <Label htmlFor="dueOn">Due</Label>
          <input
            id="dueOn"
            name="dueOn"
            type="date"
            defaultValue={task.dueOn ?? ""}
            className="min-h-11 rounded-md border border-line bg-bg px-3"
          />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <TextArea id="notes" name="notes" defaultValue={task.notes ?? ""} maxLength={5000} />
        </div>
        {state && !state.ok ? <Notice>{state.error}</Notice> : null}
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        {task.status === "open" ? (
          <Link href={`/focus/new?task=${task.id}`} className={buttonClass("plain")}>
            Focus block
          </Link>
        ) : null}
        {task.status === "done" ? (
          <Button onClick={() => setStatus("open")} disabled={changing}>
            Reopen
          </Button>
        ) : (
          <Button onClick={() => setStatus("done")} disabled={changing}>
            Mark done
          </Button>
        )}
        {task.status === "dropped" ? (
          <Button onClick={() => setStatus("open")} disabled={changing}>
            Restore
          </Button>
        ) : (
          <Button onClick={() => setStatus("dropped")} disabled={changing}>
            Drop
          </Button>
        )}
      </div>
      {statusError ? <Notice>{statusError}</Notice> : null}
    </div>
  );
}
