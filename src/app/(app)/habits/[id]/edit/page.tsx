import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HabitForm } from "@/components/habits/habit-form";
import { getContext } from "@/server/context";
import { listGoals } from "@/server/services/goals";
import { getHabit } from "@/server/services/habits";
import { uuid } from "@/server/validation/common";

export const metadata = { title: "Edit habit · W.A.R.D." };

export default function EditHabitPage({ params }: PageProps<"/habits/[id]/edit">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <EditHabit params={params} />
    </Suspense>
  );
}

async function EditHabit({ params }: Pick<PageProps<"/habits/[id]/edit">, "params">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await getContext();
  const [habit, goals] = await Promise.all([getHabit(ctx, id), listGoals(ctx)]);
  if (!habit) notFound();
  return (
    <div>
      <Link
        href={`/habits/${id}`}
        className="inline-flex min-h-11 items-center text-[15px] text-muted"
      >
        ← Back
      </Link>
      <h1 className="mt-1 mb-5 text-lg font-semibold">Edit habit</h1>
      <HabitForm
        goals={goals}
        initial={{
          id: habit.id,
          name: habit.name,
          minimumVersion: habit.minimumVersion,
          goalId: habit.goal.id,
          scheduleKind: habit.scheduleKind,
          scheduleDays: habit.scheduleDays ?? [0, 1, 2, 3, 4],
          perWeek: habit.perWeek,
          targetTime: habit.targetTime,
          blockMin: habit.blockMin,
          strict: habit.graceAllowed === 0,
        }}
      />
    </div>
  );
}
