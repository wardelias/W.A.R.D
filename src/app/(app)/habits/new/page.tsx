import Link from "next/link";
import { Suspense } from "react";
import { HabitForm } from "@/components/habits/habit-form";
import { getContext } from "@/server/context";
import { listGoals } from "@/server/services/goals";

export const metadata = { title: "New habit · W.A.R.D." };

export default function NewHabitPage() {
  return (
    <div>
      <Link href="/habits" className="inline-flex min-h-11 items-center text-[15px] text-muted">
        ← Habits
      </Link>
      <h1 className="mt-1 mb-5 text-lg font-semibold">New habit</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <NewHabit />
      </Suspense>
    </div>
  );
}

async function NewHabit() {
  const ctx = await getContext();
  const goals = await listGoals(ctx);
  return (
    <HabitForm
      goals={goals}
      initial={{
        name: "",
        minimumVersion: "",
        goalId: goals.find((g) => g.rank === 3)?.id ?? goals[0].id,
        scheduleKind: "daily",
        scheduleDays: [0, 1, 2, 3, 4],
        perWeek: 3,
        targetTime: null,
        blockMin: null,
        strict: false,
      }}
    />
  );
}
