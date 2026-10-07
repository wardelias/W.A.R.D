import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { compareDates, startOfWeek } from "@/domain/day";
import { Agenda } from "@/components/calendar/agenda";
import { TaskRow } from "@/components/tasks/task-row";
import { PlanCheckNotice } from "@/components/today/plan-check";
import { buttonClass, Muted, Section } from "@/components/ui";
import { formatDate, formatMinutes, formatRelativeDay } from "@/lib/format";
import { fixMoveIds, fixSentence, planLines } from "@/lib/plan-text";
import { taskMeta } from "@/lib/task-meta";
import { getContext } from "@/server/context";
import { dayAgenda } from "@/server/services/calendar";
import { planCheck } from "@/server/services/capacity";
import { tasksForDay } from "@/server/services/tasks";
import { isoDate } from "@/server/validation/common";

export const metadata = { title: "Day · W.A.R.D." };

export default function WeekDayPage({ params }: PageProps<"/week/[day]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Day params={params} />
    </Suspense>
  );
}

async function Day({ params }: Pick<PageProps<"/week/[day]">, "params">) {
  const { day: raw } = await params;
  const day = isoDate.safeParse(raw).data;
  if (!day) notFound();
  const ctx = await getContext();
  const [check, agenda, tasks] = await Promise.all([
    planCheck(ctx, day),
    dayAgenda(ctx, day),
    tasksForDay(ctx, day),
  ]);
  const past = compareDates(day, ctx.today) < 0;
  const label = formatRelativeDay(day, ctx.today).toLowerCase();
  const lines = planLines(check, day === ctx.today ? "today" : `on ${formatDate(day)}`);

  return (
    <div>
      <Link
        href={`/week?start=${startOfWeek(day, ctx.settings.week_start)}`}
        className="inline-flex min-h-11 items-center text-[15px] text-muted"
      >
        ← Week
      </Link>
      <h1 className="mt-1 text-lg font-semibold">{formatDate(day)}</h1>
      <p className="mt-1 text-muted">
        {formatMinutes(check.plannedMin)} of {formatMinutes(check.capacityMin)} focus planned
        {label === "today" || label === "tomorrow" || label === "yesterday" ? ` · ${label}` : ""}
      </p>

      {lines.length && !past ? (
        <Section title="Plan check">
          <PlanCheckNotice
            day={day}
            lines={lines}
            fixText={check.fix ? fixSentence(check.fix, ctx.today) : null}
            moveIds={fixMoveIds(check.fix)}
          />
        </Section>
      ) : null}

      <Section title="Calendar">
        <Agenda items={agenda} timeZone={ctx.settings.timezone} />
        {!past ? (
          <p className="mt-3">
            <Link href={`/focus/new?day=${day}`} className={buttonClass("plain")}>
              + Focus block
            </Link>
          </p>
        ) : null}
      </Section>

      <Section title="Tasks" aside={<Muted>{tasks.length}</Muted>}>
        {tasks.length ? (
          <ul>
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                returnTo={`/week/${day}`}
                task={{
                  id: t.id,
                  title: t.title,
                  done: t.status === "done",
                  meta: taskMeta(t, ctx.today, { planned: false }),
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted">No tasks planned.</p>
        )}
      </Section>
    </div>
  );
}
