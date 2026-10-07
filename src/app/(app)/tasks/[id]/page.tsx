import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addDays } from "@/domain/day";
import { getContext } from "@/server/context";
import { listGoals } from "@/server/services/goals";
import { getTask } from "@/server/services/tasks";
import { uuid } from "@/server/validation/common";
import { EditTaskForm } from "./edit-task-form";

export const metadata = { title: "Task · W.A.R.D." };

export default function TaskPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <TaskEditor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TaskEditor({ params, searchParams }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const { from } = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await getContext();
  const [task, goals] = await Promise.all([getTask(ctx, id), listGoals(ctx)]);
  if (!task) notFound();
  const returnTo =
    typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/tasks";

  return (
    <div>
      <Link href={returnTo} className="inline-flex min-h-11 items-center text-[15px] text-muted">
        ← Back
      </Link>
      <h1 className="mt-1 mb-5 text-lg font-semibold">Edit task</h1>
      <EditTaskForm
        task={task}
        goals={goals}
        today={ctx.today}
        tomorrow={addDays(ctx.today, 1)}
        returnTo={returnTo}
      />
    </div>
  );
}
