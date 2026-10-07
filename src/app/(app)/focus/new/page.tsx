import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { summarize } from "@/domain/capacity";
import { addDays, logicalInstant } from "@/domain/day";
import type { Interval } from "@/domain/slots";
import { cx, Notice, Section, UserText } from "@/components/ui";
import { formatMinutes, formatRelativeDay, formatTimeRange } from "@/lib/format";
import { getContext } from "@/server/context";
import { suggestFocusSlots } from "@/server/services/blocks";
import { calendarStatus } from "@/server/services/calendar";
import { loadForDays } from "@/server/services/capacity";
import { listGoals } from "@/server/services/goals";
import { getTask } from "@/server/services/tasks";
import { isoDate, uuid, wallTime } from "@/server/validation/common";
import { AddFocusBlocks } from "./add-focus-blocks";

export const metadata = { title: "Focus block · W.A.R.D." };

export default function FocusNewPage({ searchParams }: PageProps<"/focus/new">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <FocusNew searchParams={searchParams} />
    </Suspense>
  );
}

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

async function FocusNew({ searchParams }: Pick<PageProps<"/focus/new">, "searchParams">) {
  const params = await searchParams;
  const ctx = await getContext();
  const { today } = ctx;
  const taskId = one(params.task);
  if (taskId && !uuid.safeParse(taskId).success) notFound();
  const task = taskId ? await getTask(ctx, taskId) : null;
  if (taskId && !task) notFound();

  const count = Math.min(3, Math.max(1, Number(one(params.count) ?? 1) || 1));
  const requestedDay = isoDate.safeParse(one(params.day)).data;
  const after = one(params.after) ? new Date(one(params.after)!) : undefined;
  const at = wallTime.safeParse(one(params.at)).data;
  const blockMin = ctx.settings.focus_block_min;
  const breakMin = ctx.settings.break_min;

  let day = requestedDay && requestedDay >= today ? requestedDay : today;
  let slots: Interval[];
  if (at) {
    const first = logicalInstant(day, at, ctx.settings.timezone, ctx.settings.day_rollover);
    slots = Array.from({ length: count }, (_, i) => {
      const start = new Date(first.getTime() + i * (blockMin + breakMin) * 60_000);
      return { start, end: new Date(start.getTime() + blockMin * 60_000) };
    });
  } else {
    slots = await suggestFocusSlots(ctx, {
      day,
      count,
      notBefore: after && !Number.isNaN(after.getTime()) ? after : undefined,
    });
    if (slots.length === 0 && !requestedDay) {
      day = addDays(today, 1);
      slots = await suggestFocusSlots(ctx, { day, count });
    }
  }
  const pastSlot = slots.some((s) => s.start.getTime() < ctx.now.getTime() - 5 * 60_000);

  const [[load], goals, calendar] = await Promise.all([
    loadForDays(ctx, day, 1),
    listGoals(ctx),
    calendarStatus(ctx),
  ]);
  const after_ = summarize({
    ...load,
    blocks: [
      ...load.blocks,
      ...slots.map((s, i) => ({
        id: `new-${i}`,
        minutes: blockMin,
        startsAt: s.start,
        taskId: task?.id ?? null,
        goalRank: task?.goal.rank ?? 1,
        outcome: null,
        title: "",
      })),
    ],
  });
  const capacity = ctx.settings.focus_capacity_min;
  const base = new URLSearchParams();
  if (task) base.set("task", task.id);
  const href = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams(base);
    const merged = { day, count: String(count), ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/focus/new?${q.toString()}`;
  };
  const chip = (active: boolean) =>
    cx(
      "inline-flex min-h-9 items-center rounded-md border px-2.5 text-sm",
      active ? "border-fg font-semibold" : "border-line text-muted",
    );
  const returnTo = task ? "/today" : "/today";
  const title = task?.title ?? "Focus";
  const tz = ctx.settings.timezone;

  return (
    <div>
      <Link href="/today" className="inline-flex min-h-11 items-center text-[15px] text-muted">
        ← Back
      </Link>
      <h1 className="mt-1 text-lg font-semibold">
        Focus for: <UserText>{title}</UserText>
      </h1>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-sm text-muted">Day</span>
          {[today, addDays(today, 1)].map((d) => (
            <Link
              key={d}
              href={href({ day: d, after: undefined, at: undefined })}
              className={chip(day === d)}
              aria-current={day === d}
            >
              {formatRelativeDay(d, today)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-sm text-muted">Blocks</span>
          {[1, 2, 3].map((n) => (
            <Link
              key={n}
              href={href({ count: String(n), after: one(params.after), at })}
              className={chip(count === n)}
              aria-current={count === n}
            >
              {n}
            </Link>
          ))}
          <span className="text-sm text-muted">
            {blockMin}m on / {breakMin}m off
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-sm text-muted">Time</span>
          {after || at ? (
            <Link href={href({ after: undefined, at: undefined })} className={chip(false)}>
              Earlier
            </Link>
          ) : null}
          {slots.length ? (
            <Link
              href={href({
                after: new Date(slots[0].start.getTime() + 5 * 60_000).toISOString(),
                at: undefined,
              })}
              className={chip(false)}
            >
              Later
            </Link>
          ) : null}
          <form action="/focus/new" className="flex items-center gap-1.5">
            {task ? <input type="hidden" name="task" value={task.id} /> : null}
            <input type="hidden" name="day" value={day} />
            <input type="hidden" name="count" value={count} />
            <label htmlFor="at" className="sr-only">
              Pick a start time
            </label>
            <input
              id="at"
              name="at"
              type="time"
              defaultValue={at ?? ""}
              className="min-h-9 rounded-md border border-line bg-bg px-2 text-sm"
            />
            <button type="submit" className={chip(Boolean(at))}>
              Use time
            </button>
          </form>
        </div>
      </div>

      <Section
        title={calendar.connection ? "Adds to Google Calendar “W.A.R.D.”" : "Adds to your plan"}
      >
        {slots.length === 0 ? (
          <p className="text-[15px]">
            No free {blockMin}-minute slot left in your focus windows on{" "}
            {formatRelativeDay(day, today)}. Pick a time or another day.
          </p>
        ) : (
          <ul>
            {slots.map((s) => (
              <li key={s.start.toISOString()} className="flex gap-3 border-b border-line py-2">
                <span className="w-[6.5rem] shrink-0 text-sm text-muted tabular-nums">
                  {formatTimeRange(s.start, s.end, tz)}
                </span>
                <span>
                  Focus · <UserText>{title}</UserText>
                </span>
              </li>
            ))}
          </ul>
        )}
        {!calendar.connection ? (
          <p className="mt-2 text-sm text-muted">
            Saved in W.A.R.D. It goes to Google Calendar once you connect it in Settings.
          </p>
        ) : null}
        <p className={cx("mt-3 text-[15px]", after_.plannedMin > capacity && "font-semibold")}>
          {formatRelativeDay(day, today)} after this: {formatMinutes(after_.plannedMin)} of{" "}
          {formatMinutes(capacity)}
          {after_.plannedMin > capacity
            ? ` — over by ${formatMinutes(after_.plannedMin - capacity)}`
            : ""}
        </p>
        {pastSlot ? (
          <Notice className="mt-2">That time has already passed. Pick a later time.</Notice>
        ) : null}
      </Section>

      <AddFocusBlocks
        taskId={task?.id ?? null}
        goals={task ? [] : goals.map((g) => ({ id: g.id, label: g.label }))}
        starts={pastSlot ? [] : slots.map((s) => s.start.toISOString())}
        minutes={blockMin}
        returnTo={returnTo}
      />
    </div>
  );
}
