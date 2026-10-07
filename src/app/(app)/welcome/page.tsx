import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui";
import { scheduleValues, timeZoneList } from "@/lib/settings-values";
import { getContext } from "@/server/context";
import { getConnection } from "@/server/google/accounts";
import { createAdminClient } from "@/server/supabase/admin";
import { listGoals } from "@/server/services/goals";
import { FirstHabits, GoalsStep, ScheduleStep } from "./steps";

export const metadata = { title: "Welcome · W.A.R.D." };

export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Welcome searchParams={searchParams} />
    </Suspense>
  );
}

async function Welcome({ searchParams }: Pick<PageProps<"/welcome">, "searchParams">) {
  const { step: raw } = await searchParams;
  const step = Math.min(4, Math.max(1, Number(raw) || 1));
  const ctx = await getContext();
  const header = (title: string) => (
    <header className="mb-5">
      <p className="text-sm text-muted">{step}/4</p>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );

  if (step === 1) {
    return (
      <div>
        {header("Your day")}
        <p className="mb-4 text-[15px] text-muted">
          Prefilled from your schedule. Change anything that&apos;s off.
        </p>
        <ScheduleStep initial={scheduleValues(ctx.settings)} timeZones={timeZoneList()} />
      </div>
    );
  }

  if (step === 2) {
    const goals = await listGoals(ctx);
    return (
      <div>
        {header("Goal ladder")}
        <p className="mb-4 text-[15px] text-muted">
          Every task and habit links to one of these. Priority 1 work is protected first.
        </p>
        <GoalsStep initial={goals.map((g) => ({ id: g.id, title: g.title, label: g.label }))} />
      </div>
    );
  }

  if (step === 3) {
    const connection = await getConnection(createAdminClient(), ctx.userId);
    return (
      <div>
        {header("Google Calendar")}
        <p className="mb-4 text-[15px]">
          W.A.R.D. reads the calendars you choose and writes only to its own calendar, named
          “W.A.R.D.”. Your other events stay untouched.
        </p>
        {connection ? (
          <p className="mb-4">
            Connected as <bdi>{connection.email}</bdi>.
          </p>
        ) : (
          <a href="/api/google/connect?next=/welcome?step=4" className={buttonClass("primary")}>
            Connect
          </a>
        )}
        <div className="mt-6">
          <Link href="/welcome?step=4" className={buttonClass("plain")}>
            {connection ? "Next" : "Later"}
          </Link>
        </div>
      </div>
    );
  }

  const goals = await listGoals(ctx);
  return (
    <div>
      {header("First habits (optional)")}
      <p className="mb-4 text-[15px] text-muted">
        Start with one or two. Each has a minimum version, so a bad day still counts.
      </p>
      <FirstHabits goals={goals.map((g) => ({ id: g.id, rank: g.rank }))} />
    </div>
  );
}
