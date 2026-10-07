import Link from "next/link";
import { Suspense } from "react";
import { addDays } from "@/domain/day";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskRow } from "@/components/tasks/task-row";
import { cx, Muted, Section } from "@/components/ui";
import { taskMeta } from "@/lib/task-meta";
import { getContext } from "@/server/context";
import { listGoals } from "@/server/services/goals";
import { listTasks, type Task } from "@/server/services/tasks";

export const metadata = { title: "Tasks · W.A.R.D." };

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "dropped", label: "Dropped" },
] as const;
type View = (typeof VIEWS)[number]["key"];

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <>
      <h1 className="text-lg font-semibold">Tasks</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <TasksView searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TasksView({ searchParams }: Pick<PageProps<"/tasks">, "searchParams">) {
  const params = await searchParams;
  const view: View = VIEWS.some((v) => v.key === params.view) ? (params.view as View) : "open";
  const ctx = await getContext();
  const [goals, tasks] = await Promise.all([listGoals(ctx), listTasks(ctx, { status: view })]);
  const today = ctx.today;

  return (
    <div>
      <nav aria-label="Task views" className="mt-2 mb-5 flex gap-4 text-[15px]">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "open" ? "/tasks" : `/tasks?view=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={cx("py-2", view === v.key ? "font-semibold" : "text-muted")}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "open" ? (
        <QuickAdd goals={goals} today={today} tomorrow={addDays(today, 1)} defaultWhen="later" />
      ) : null}

      {tasks.length === 0 ? (
        <p className="mt-8 text-muted">
          {view === "open"
            ? "No open tasks."
            : view === "done"
              ? "Nothing done yet."
              : "Nothing dropped."}
        </p>
      ) : view === "open" ? (
        goals.map((goal) => {
          const inGoal = tasks.filter((t) => t.goal.id === goal.id);
          if (!inGoal.length) return null;
          return (
            <Section key={goal.id} title={goal.label} aside={<Muted>{inGoal.length}</Muted>}>
              <TaskList tasks={inGoal} today={today} showGoal={false} />
            </Section>
          );
        })
      ) : (
        <Section title={view === "done" ? "Done" : "Dropped"}>
          <TaskList tasks={tasks} today={today} showGoal />
        </Section>
      )}
    </div>
  );
}

function TaskList({ tasks, today, showGoal }: { tasks: Task[]; today: string; showGoal: boolean }) {
  return (
    <ul>
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          returnTo="/tasks"
          task={{
            id: t.id,
            title: t.title,
            done: t.status === "done",
            meta: taskMeta(t, today, { goal: showGoal }),
          }}
        />
      ))}
    </ul>
  );
}
