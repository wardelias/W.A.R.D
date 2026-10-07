import Link from "next/link";
import { Suspense } from "react";
import { checkDay } from "@/domain/capacity";
import { addDays, compareDates, startOfWeek } from "@/domain/day";
import { cx } from "@/components/ui";
import { formatDate, formatMinutes } from "@/lib/format";
import { getContext } from "@/server/context";
import { loadForDays } from "@/server/services/capacity";
import { isoDate } from "@/server/validation/common";

export const metadata = { title: "Week · W.A.R.D." };

export default function WeekPage({ searchParams }: PageProps<"/week">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Week searchParams={searchParams} />
    </Suspense>
  );
}

async function Week({ searchParams }: Pick<PageProps<"/week">, "searchParams">) {
  const { start: requested } = await searchParams;
  const ctx = await getContext();
  const { today } = ctx;
  const weekStart = ctx.settings.week_start;
  const parsed = isoDate.safeParse(requested).data;
  const start = startOfWeek(parsed ?? today, weekStart);
  const days = await loadForDays(ctx, start, 7);
  const capacity = ctx.settings.focus_capacity_min;
  const end = addDays(start, 6);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">
          Week · {formatDate(start).slice(4)} – {formatDate(end).slice(4)}
        </h1>
        <span className="text-sm text-muted">capacity {formatMinutes(capacity)}/day</span>
      </header>

      <ul className="mt-5">
        {days.map((load) => {
          const check = checkDay(load, capacity);
          const past = compareDates(load.day, today) < 0;
          const isToday = load.day === today;
          const flags = [
            isToday ? "today" : null,
            check.overBy > 0 ? `over by ${formatMinutes(check.overBy)}` : null,
            check.noPriorityOne ? "no Grades work" : null,
          ].filter(Boolean);
          return (
            <li key={load.day} className="border-b border-line">
              <Link href={`/week/${load.day}`} className="flex min-h-12 items-baseline gap-3 py-3">
                <span
                  className={cx("w-20 shrink-0", isToday && "font-semibold", past && "text-muted")}
                >
                  {formatDate(load.day).replace(/ \w+$/, "")}
                </span>
                <span className={cx("w-16 shrink-0 tabular-nums", past && "text-muted")}>
                  {check.hasPlan ? formatMinutes(check.plannedMin) : "—"}
                </span>
                <span
                  className={cx(
                    "min-w-0 flex-1 text-sm",
                    check.overBy > 0 && !past ? "font-semibold" : "text-muted",
                  )}
                >
                  {flags.join(" · ")}
                </span>
                {check.overBy > 0 && !past ? (
                  <span className="text-sm underline underline-offset-4">Fix</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Planned focus: focus blocks plus estimates of tasks without a block.
      </p>

      <nav className="mt-6 flex justify-between" aria-label="Weeks">
        <Link href={`/week?start=${addDays(start, -7)}`} className="min-h-11 py-2">
          ← Previous
        </Link>
        {start !== startOfWeek(today, weekStart) ? (
          <Link href="/week" className="min-h-11 py-2 text-muted">
            This week
          </Link>
        ) : null}
        <Link href={`/week?start=${addDays(start, 7)}`} className="min-h-11 py-2">
          Next →
        </Link>
      </nav>
    </div>
  );
}
