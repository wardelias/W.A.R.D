import Link from "next/link";
import { Suspense } from "react";
import { addDays, localTime } from "@/domain/day";
import type { OverloadFix } from "@/domain/capacity";
import { isolate } from "@/domain/text";
import { HabitCheck } from "@/components/habits/habit-check";
import { EarlierTasks } from "@/components/today/earlier-tasks";
import { OneThing } from "@/components/today/one-thing";
import { PlanCheckNotice } from "@/components/today/plan-check";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskRow } from "@/components/tasks/task-row";
import { buttonClass, Muted, Section } from "@/components/ui";
import { formatDate, formatMinutes, formatRelativeDay } from "@/lib/format";
import { taskMeta } from "@/lib/task-meta";
import { getContext, type Ctx } from "@/server/context";
import { planCheck, type PlanCheck } from "@/server/services/capacity";
import { listGoals } from "@/server/services/goals";
import { habitSummaries } from "@/server/services/habits";
import { getDayPlan } from "@/server/services/plans";
import { overdueTasks, tasksForDay } from "@/server/services/tasks";

export const metadata = { title: "Today · W.A.R.D." };

export default function TodayPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Today />
    </Suspense>
  );
}

function isAfterShutdown(ctx: Ctx): boolean {
  const now = localTime(ctx.now, ctx.settings.timezone);
  const shutdown = ctx.settings.shutdown_time.slice(0, 5);
  const rollover = ctx.settings.day_rollover.slice(0, 5);
  return now >= shutdown || now < rollover;
}

function fixSentence(fix: OverloadFix, today: string): string {
  const moves = fix.moves.filter((m) => m.toDay);
  if (moves.length === 0) return "No day in the coming week has room. Drop or shrink something.";
  const parts = moves.map(
    (m) =>
      `“${isolate(m.item.title)}” (${formatMinutes(m.item.minutes)}) to ${formatRelativeDay(m.toDay!, today)}`,
  );
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `Move ${list}?${fix.fixed ? "" : " Still over after that."}`;
}

function planLines(check: PlanCheck): string[] {
  const lines: string[] = [];
  if (check.overBy > 0) {
    lines.push(
      `Focus planned ${formatMinutes(check.plannedMin)} of ${formatMinutes(check.capacityMin)}. Over by ${formatMinutes(check.overBy)}.`,
    );
  }
  if (check.noPriorityOne) lines.push("No Grades work planned today.");
  return lines;
}

async function Today() {
  const ctx = await getContext();
  const { today } = ctx;
  const [goals, plan, dayTasks, earlier, check, habits] = await Promise.all([
    listGoals(ctx),
    getDayPlan(ctx, today),
    tasksForDay(ctx, today),
    overdueTasks(ctx, today),
    planCheck(ctx, today),
    habitSummaries(ctx),
  ]);

  const openToday = dayTasks.filter((t) => t.status === "open");
  const mit = dayTasks.find((t) => t.id === plan.mitTaskId) ?? null;
  const top = dayTasks.slice(0, 3);
  const more = dayTasks.length - top.length;
  const todayHabits = habits.filter((h) => h.scheduledToday);
  const lines = planLines(check);
  const afterShutdown = isAfterShutdown(ctx);
  const moveIds = (check.fix?.moves ?? [])
    .filter((m) => m.toDay)
    .map((m) => (m.item.kind === "task" ? m.item.taskId : m.item.blockId));

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">{formatDate(today)}</h1>
        <Link href="/settings" className="min-h-11 py-2 text-[15px] text-muted">
          Settings
        </Link>
      </header>

      <Section title="One thing" className="mt-4">
        <OneThing
          day={today}
          setBeforeDay={plan.setBeforeDay}
          current={
            mit && mit.status === "open"
              ? {
                  id: mit.id,
                  title: mit.title,
                  meta: taskMeta(mit, today, { planned: false }).join(" · "),
                }
              : null
          }
          candidates={openToday.slice(0, 5).map((t) => ({
            id: t.id,
            title: t.title,
            meta: taskMeta(t, today, { planned: false }).join(" · "),
          }))}
        />
        {mit && mit.status === "done" ? (
          <p className="mt-1 text-sm text-muted">Done. Pick the next from the list below.</p>
        ) : null}
      </Section>

      <Section
        title="Top 3"
        aside={
          <Muted>
            {formatMinutes(check.plannedMin)} of {formatMinutes(check.capacityMin)}
          </Muted>
        }
      >
        {top.length ? (
          <ul>
            {top.map((t) => (
              <TaskRow
                key={t.id}
                returnTo="/today"
                task={{
                  id: t.id,
                  title: t.title,
                  done: t.status === "done",
                  meta: taskMeta(t, today, { planned: false }),
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted">Nothing planned for today yet.</p>
        )}
        {more > 0 ? (
          <p className="mt-2 text-sm">
            <Link href="/tasks" className="text-muted">
              {more} more planned today
            </Link>
          </p>
        ) : null}
        <div className="mt-3">
          <QuickAdd goals={goals} today={today} tomorrow={addDays(today, 1)} defaultWhen="today" />
        </div>
      </Section>

      {lines.length ? (
        <Section title="Plan check">
          <PlanCheckNotice
            day={today}
            lines={lines}
            fixText={check.fix ? fixSentence(check.fix, today) : null}
            moveIds={moveIds}
          />
        </Section>
      ) : null}

      {earlier.length ? (
        <Section title="Left from earlier" aside={<Muted>{earlier.length}</Muted>}>
          <EarlierTasks
            items={earlier.map((t) => ({
              id: t.id,
              title: t.title,
              meta: taskMeta(t, today).join(" · "),
            }))}
          />
        </Section>
      ) : null}

      <Section
        title="Habits"
        aside={
          todayHabits.length
            ? `${todayHabits.filter((h) => h.todayLevel).length} of ${todayHabits.length}`
            : undefined
        }
      >
        {todayHabits.length ? (
          <ul>
            {todayHabits.map((s) => (
              <HabitCheck
                key={s.habit.id}
                habit={{
                  id: s.habit.id,
                  name: s.habit.name,
                  minimumVersion: s.habit.minimumVersion,
                  level: s.todayLevel,
                  neverMissTwice: s.streak.neverMissTwice,
                  meta: s.habit.targetTime ?? undefined,
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted">
            No habits scheduled today. <Link href="/habits/new">Add one</Link>
          </p>
        )}
      </Section>

      <div className="mt-10">
        <Link
          href="/shutdown"
          className={
            afterShutdown
              ? buttonClass("primary", "w-full")
              : buttonClass("plain", "w-full text-muted")
          }
        >
          {afterShutdown
            ? "Start shutdown"
            : `Shutdown (${ctx.settings.shutdown_time.slice(0, 5)})`}
        </Link>
      </div>
    </div>
  );
}
