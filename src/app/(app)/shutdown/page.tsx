import Link from "next/link";
import { Suspense } from "react";
import { addDays } from "@/domain/day";
import { summarize } from "@/domain/capacity";
import { HabitCheck } from "@/components/habits/habit-check";
import { buttonClass, Section, UserParagraph } from "@/components/ui";
import { formatClock, formatDate, formatMinutes } from "@/lib/format";
import { taskMeta } from "@/lib/task-meta";
import { getContext, type Ctx } from "@/server/context";
import { loadForDays } from "@/server/services/capacity";
import { focusBlocksForDay, getDailyReview, type DailyReview } from "@/server/services/checkin";
import { listGoals } from "@/server/services/goals";
import { habitSummaries } from "@/server/services/habits";
import { getDayPlan } from "@/server/services/plans";
import { tasksForDay } from "@/server/services/tasks";
import { ShutdownForm } from "./shutdown-form";

export const metadata = { title: "Shutdown · W.A.R.D." };

export default function ShutdownPage({ searchParams }: PageProps<"/shutdown">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Shutdown searchParams={searchParams} />
    </Suspense>
  );
}

async function Shutdown({ searchParams }: Pick<PageProps<"/shutdown">, "searchParams">) {
  const { edit } = await searchParams;
  const ctx = await getContext();
  const review = await getDailyReview(ctx, ctx.today);
  if (review && edit !== "1") return <Closed ctx={ctx} review={review} />;
  return <CheckIn ctx={ctx} note={review?.note ?? ""} />;
}

function Closed({ ctx, review }: { ctx: Ctx; review: DailyReview }) {
  const s = review.stats;
  return (
    <div>
      <h1 className="text-lg font-semibold">Shutdown · {formatDate(ctx.today)}</h1>
      <p className="mt-2">
        Day closed at {formatClock(new Date(review.completedAt), ctx.settings.timezone)}.
      </p>
      <Section title="Today">
        <ul className="space-y-1 text-[15px]">
          <li>
            Tasks: {s.tasks.done} done of {s.tasks.planned} planned · {s.tasks.moved} moved ·{" "}
            {s.tasks.dropped} dropped
          </li>
          {s.focus.blocks ? (
            <li>
              Focus: {formatMinutes(s.focus.doneMin)} done of {formatMinutes(s.focus.plannedMin)}{" "}
              planned
              {s.focus.skipped ? ` · ${s.focus.skipped} skipped` : ""}
            </li>
          ) : null}
          {s.habits.scheduled ? (
            <li>
              Habits: {s.habits.full} full · {s.habits.minimum} minimum · {s.habits.missed} missed
              of {s.habits.scheduled}
            </li>
          ) : null}
          <li>
            Tomorrow starts with:{" "}
            {s.firstTaskTomorrow ? <bdi>{s.firstTaskTomorrow}</bdi> : "not set"}
          </li>
        </ul>
        {review.note ? (
          <UserParagraph className="mt-3 text-[15px]">{review.note}</UserParagraph>
        ) : null}
      </Section>
      <div className="mt-8 flex gap-2">
        <Link href="/today" className={buttonClass("primary")}>
          Done
        </Link>
        <Link href="/shutdown?edit=1" className={buttonClass("plain")}>
          Edit check-in
        </Link>
      </div>
    </div>
  );
}

async function CheckIn({ ctx, note }: { ctx: Ctx; note: string }) {
  const { today } = ctx;
  const tomorrow = addDays(today, 1);
  const [goals, tasks, blocks, tomorrowTasks, [tomorrowLoad], habits, tomorrowPlan] =
    await Promise.all([
      listGoals(ctx),
      tasksForDay(ctx, today),
      focusBlocksForDay(ctx, today),
      tasksForDay(ctx, tomorrow),
      loadForDays(ctx, tomorrow, 1),
      habitSummaries(ctx),
      getDayPlan(ctx, tomorrow),
    ]);
  const load = summarize(tomorrowLoad);
  const unlogged = habits.filter((h) => h.scheduledToday && !h.todayLevel);
  const toRow = (t: (typeof tasks)[number]) => ({
    id: t.id,
    title: t.title,
    meta: taskMeta(t, today, { planned: false }).join(" · "),
    done: t.status === "done",
    slipCount: t.slipCount,
    estMin: t.estMin,
    goalRank: t.goal.rank,
  });

  return (
    <div>
      <h1 className="text-lg font-semibold">Shutdown · {formatDate(today)}</h1>
      <p className="mt-1 text-sm text-muted">
        About a minute. Unfinished tasks move to tomorrow unless you choose otherwise.
      </p>
      <ShutdownForm
        day={today}
        tomorrow={tomorrow}
        tasks={tasks.map(toRow)}
        blocks={blocks.map((b) => ({
          id: b.id,
          time: formatClock(new Date(b.startsAt), ctx.settings.timezone),
          title: b.title,
          outcome: b.outcome,
        }))}
        tomorrowTasks={tomorrowTasks.filter((t) => t.status === "open").map(toRow)}
        tomorrowLoadMin={load.plannedMin}
        tomorrowHasGrades={load.hasPriorityOne}
        capacityMin={ctx.settings.focus_capacity_min}
        goals={goals}
        currentFirst={tomorrowPlan.mitTaskId}
        initialNote={note}
        habits={
          unlogged.length ? (
            <>
              <ul>
                {unlogged.map((s) => (
                  <HabitCheck
                    key={s.habit.id}
                    habit={{
                      id: s.habit.id,
                      name: s.habit.name,
                      minimumVersion: s.habit.minimumVersion,
                      level: s.todayLevel,
                      neverMissTwice: s.streak.neverMissTwice,
                    }}
                  />
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted">Left untouched, they count as missed.</p>
            </>
          ) : (
            <p className="text-muted">All of today&apos;s habits are logged.</p>
          )
        }
      />
    </div>
  );
}
