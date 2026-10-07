import Link from "next/link";
import { Suspense } from "react";
import { HabitCheck } from "@/components/habits/habit-check";
import { buttonClass, cx, Section, UserText } from "@/components/ui";
import { rateLabel, scheduleLabel } from "@/lib/habit-meta";
import { getContext } from "@/server/context";
import { habitSummaries, listHabits } from "@/server/services/habits";

export const metadata = { title: "Habits · W.A.R.D." };

export default function HabitsPage({ searchParams }: PageProps<"/habits">) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Habits</h1>
        <Link href="/habits/new" className={buttonClass("plain")}>
          + New
        </Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <HabitsView searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function HabitsView({ searchParams }: Pick<PageProps<"/habits">, "searchParams">) {
  const { view } = await searchParams;
  const ctx = await getContext();

  if (view === "archived") {
    const archived = await listHabits(ctx, { archived: true });
    return (
      <Section title="Archived" aside={<Link href="/habits">Active</Link>}>
        {archived.length === 0 ? (
          <p className="text-muted">Nothing archived.</p>
        ) : (
          <ul>
            {archived.map((h) => (
              <li key={h.id} className="border-b border-line py-3">
                <Link href={`/habits/${h.id}`} className="block">
                  <UserText>{h.name}</UserText>
                  <span className="ms-2 text-sm text-muted">{h.goal.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    );
  }

  const summaries = await habitSummaries(ctx);
  if (summaries.length === 0) {
    return (
      <div className="mt-8 space-y-2">
        <p>No habits yet.</p>
        <p className="text-muted">
          Start with one or two. Each habit has a minimum version, so a bad day still counts.
        </p>
        <p className="pt-2">
          <Link href="/habits?view=archived" className="text-sm text-muted">
            Archived
          </Link>
        </p>
      </div>
    );
  }

  const today = summaries.filter((s) => s.scheduledToday);
  const notToday = summaries.filter((s) => !s.scheduledToday);

  return (
    <div>
      <Section
        title="Today"
        aside={`${today.filter((s) => s.todayLevel).length} of ${today.length}`}
      >
        <ul>
          {today.map((s) => (
            <HabitCheck
              key={s.habit.id}
              habit={{
                id: s.habit.id,
                name: s.habit.name,
                minimumVersion: s.habit.minimumVersion,
                level: s.todayLevel,
                neverMissTwice: s.streak.neverMissTwice,
                meta:
                  s.habit.scheduleKind === "per_week"
                    ? `${s.thisWeek} of ${s.habit.perWeek} this week`
                    : `streak ${s.streak.streak}`,
              }}
            />
          ))}
        </ul>
      </Section>

      <Section title="All habits">
        <ul>
          {summaries.map((s) => (
            <li key={s.habit.id} className="border-b border-line py-3">
              <Link href={`/habits/${s.habit.id}`} className="block">
                <span className="flex items-baseline justify-between gap-3">
                  <UserText className="break-words">{s.habit.name}</UserText>
                  <span className="shrink-0 text-sm text-muted">
                    {s.habit.goal.label} · streak {s.streak.streak} · {rateLabel(s.stats.rate)}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  min: <UserText>{s.habit.minimumVersion}</UserText> · {scheduleLabel(s.habit)}
                  {s.habit.targetTime ? ` · ${s.habit.targetTime}` : ""}
                  {s.habit.blockMin ? ` · ${s.habit.blockMin}m block` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {notToday.length ? (
          <p className="mt-2 text-sm text-muted">
            Not scheduled today: {notToday.map((s) => s.habit.name).join(", ")}
          </p>
        ) : null}
        <p className={cx("mt-4")}>
          <Link href="/habits?view=archived" className="text-sm text-muted">
            Archived
          </Link>
        </p>
      </Section>
    </div>
  );
}
