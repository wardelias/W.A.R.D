import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addDays, compareDates, dateRange, startOfWeek, weekday } from "@/domain/day";
import { isScheduledOn } from "@/domain/habits";
import { buttonClass, Section, UserText } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { DAY_NAMES, scheduleLabel } from "@/lib/habit-meta";
import { getContext } from "@/server/context";
import { getHabit, logsByHabit, ruleOf, summarizeHabit } from "@/server/services/habits";
import { uuid } from "@/server/validation/common";
import { ArchiveButton } from "./archive-button";

export const metadata = { title: "Habit · W.A.R.D." };

const SYMBOL = { full: "✓", minimum: "m", missed: "x", off: "·", open: "○", none: "" } as const;
type Cell = keyof typeof SYMBOL;
const CELL_LABEL: Record<Cell, string> = {
  full: "full",
  minimum: "minimum",
  missed: "missed",
  off: "not scheduled",
  open: "today, open",
  none: "",
};

export default function HabitPage({ params }: PageProps<"/habits/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <HabitDetail params={params} />
    </Suspense>
  );
}

async function HabitDetail({ params }: Pick<PageProps<"/habits/[id]">, "params">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await getContext();
  const habit = await getHabit(ctx, id);
  if (!habit) notFound();
  const logs = (await logsByHabit(ctx, [id])).get(id) ?? new Map();
  const { today } = ctx;
  const weekStart = ctx.settings.week_start;
  const s = summarizeHabit(habit, logs, today, weekStart);
  const rule = ruleOf(habit, today);

  const firstWeek = startOfWeek(addDays(today, -35), weekStart);
  const weeks: string[] = [];
  for (let w = firstWeek; compareDates(w, today) <= 0; w = addDays(w, 7)) {
    if (compareDates(addDays(w, 6), habit.startsOn) >= 0) weeks.push(w);
  }
  const cell = (d: string): Cell => {
    if (compareDates(d, habit.startsOn) < 0 || compareDates(d, today) > 0) return "none";
    const level = logs.get(d);
    if (level) return level;
    if (d === today)
      return isScheduledOn(rule, d) && habit.scheduleKind !== "per_week" ? "open" : "off";
    if (habit.scheduleKind === "per_week") return "off";
    return isScheduledOn(rule, d) ? "missed" : "off";
  };
  const headers = dateRange(firstWeek, addDays(firstWeek, 6)).map((d) => DAY_NAMES[weekday(d)]);

  const grace =
    habit.graceAllowed === 0
      ? "Strict: any miss resets"
      : s.streak.forgiven.length
        ? `grace used ${s.streak.forgiven.map((d) => formatDate(d)).join(", ")}`
        : `1 miss forgiven per ${habit.graceWindow} ${habit.scheduleKind === "per_week" ? "weeks" : "scheduled days"}, never two in a row`;

  return (
    <div>
      <Link href="/habits" className="inline-flex min-h-11 items-center text-[15px] text-muted">
        ← Habits
      </Link>
      <h1 className="mt-1 text-lg font-semibold">
        <UserText>{habit.name}</UserText>
        <span className="ms-2 text-[15px] font-normal text-muted">{habit.goal.label}</span>
      </h1>
      <p className="mt-1 text-muted">
        min: <UserText>{habit.minimumVersion}</UserText> · {scheduleLabel(habit)}
        {habit.targetTime ? ` · ${habit.targetTime}` : ""}
      </p>
      {habit.archivedAt ? <p className="mt-2">Archived.</p> : null}

      <Section title="Streak">
        <p>
          <span className="text-2xl font-semibold">{s.streak.streak}</span>{" "}
          <span className="text-muted">
            {habit.scheduleKind === "per_week" ? "weeks" : "in a row"}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">{grace}</p>
        {s.thisWeek !== null ? (
          <p className="mt-1 text-sm">
            This week: {s.thisWeek} of {habit.perWeek}
          </p>
        ) : null}
      </Section>

      <Section title="Last 30 days">
        <p>
          {s.stats.full} full · {s.stats.minimum} minimum · {s.stats.missed} missed
          {habit.scheduleKind === "per_week" ? " weeks" : ""} · of {s.stats.scheduled}{" "}
          {habit.scheduleKind === "per_week" ? "weeks" : "scheduled"}
          {s.stats.rate !== null ? ` (${Math.round(s.stats.rate * 100)}%)` : ""}
        </p>
      </Section>

      <Section title="History">
        <table className="font-mono text-[15px]">
          <thead>
            <tr>
              <th className="pe-3 text-start font-normal text-muted">
                <span className="sr-only">Week of</span>
              </th>
              {headers.map((h, i) => (
                <th key={i} className="w-9 text-center font-normal text-muted">
                  {h.slice(0, 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w}>
                <th
                  scope="row"
                  className="pe-3 text-start font-sans text-sm font-normal text-muted"
                >
                  {formatDate(w).slice(4)}
                </th>
                {dateRange(w, addDays(w, 6)).map((d) => {
                  const c = cell(d);
                  return (
                    <td
                      key={d}
                      className="h-8 w-9 text-center"
                      aria-label={c === "none" ? undefined : `${formatDate(d)}: ${CELL_LABEL[c]}`}
                    >
                      {SYMBOL[c]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-sm text-muted">
          ✓ full · m minimum · x missed · · not scheduled · ○ today
        </p>
      </Section>

      <div className="mt-8 flex gap-2">
        <Link href={`/habits/${habit.id}/edit`} className={buttonClass("plain")}>
          Edit
        </Link>
        <ArchiveButton id={habit.id} archived={Boolean(habit.archivedAt)} />
      </div>
    </div>
  );
}
