"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Chips } from "@/components/chips";
import { Button, cx, Label, Notice, Section, TextArea, TextField, UserText } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { closeDayAction } from "@/server/actions/checkin";

type Goal = { id: string; label: string; rank: number };
export type ShutdownTask = {
  id: string;
  title: string;
  meta: string;
  done: boolean;
  slipCount: number;
  estMin: number | null;
  goalRank: number;
};
export type ShutdownBlock = { id: string; time: string; title: string; outcome: Outcome | null };
type Outcome = "done" | "partial" | "skipped";
type Choice = "done" | "tomorrow" | "pick" | "drop";
type First = { kind: "existing"; taskId: string } | { kind: "new" } | null;

const NEXT_OUTCOME: Record<string, Outcome> = {
  none: "done",
  done: "partial",
  partial: "skipped",
  skipped: "done",
};

export function ShutdownForm({
  day,
  tomorrow,
  tasks,
  blocks,
  tomorrowTasks,
  tomorrowLoadMin,
  tomorrowHasGrades,
  capacityMin,
  goals,
  currentFirst,
  habits,
  initialNote,
}: {
  day: string;
  tomorrow: string;
  tasks: ShutdownTask[];
  blocks: ShutdownBlock[];
  tomorrowTasks: ShutdownTask[];
  tomorrowLoadMin: number;
  tomorrowHasGrades: boolean;
  capacityMin: number;
  goals: Goal[];
  currentFirst: string | null;
  habits: ReactNode;
  initialNote: string;
}) {
  const router = useRouter();
  const open = tasks.filter((t) => !t.done);
  const [choices, setChoices] = useState<Record<string, Choice>>(
    Object.fromEntries(open.map((t) => [t.id, "tomorrow"])),
  );
  const [pickDays, setPickDays] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome | null>>(
    Object.fromEntries(blocks.map((b) => [b.id, b.outcome])),
  );
  const movedToTomorrow = open.filter((t) => choices[t.id] === "tomorrow");
  const firstCandidates = [...movedToTomorrow, ...tomorrowTasks]
    .sort((a, b) => a.goalRank - b.goalRank)
    .slice(0, 5);
  const [first, setFirst] = useState<First>(
    currentFirst
      ? { kind: "existing", taskId: currentFirst }
      : firstCandidates[0]
        ? { kind: "existing", taskId: firstCandidates[0].id }
        : null,
  );
  const [newTitle, setNewTitle] = useState("");
  const [newGoal, setNewGoal] = useState(goals[0]?.id ?? "");
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const tomorrowMin = tomorrowLoadMin + movedToTomorrow.reduce((s, t) => s + (t.estMin ?? 0), 0);
  const gradesTomorrow =
    tomorrowHasGrades ||
    movedToTomorrow.some((t) => t.goalRank === 1) ||
    (first?.kind === "new" && goals.find((g) => g.id === newGoal)?.rank === 1);
  const firstValid =
    first?.kind === "new"
      ? newTitle.trim().length > 0
      : first?.kind !== "existing" || firstCandidates.some((c) => c.id === first.taskId);

  function submit() {
    setError(null);
    const decisions = open.map((t) => {
      const c = choices[t.id];
      if (c === "done") return { id: t.id, action: "done" as const };
      if (c === "drop") return { id: t.id, action: "drop" as const };
      return {
        id: t.id,
        action: "move" as const,
        toDay: c === "pick" ? pickDays[t.id] || tomorrow : tomorrow,
      };
    });
    startTransition(async () => {
      const result = await closeDayAction({
        day,
        tasks: decisions,
        blocks: Object.entries(outcomes)
          .filter((e): e is [string, Outcome] => e[1] !== null)
          .map(([id, outcome]) => ({ id, outcome })),
        firstTask:
          first?.kind === "new"
            ? { kind: "new", title: newTitle, goalId: newGoal }
            : first?.kind === "existing" && firstValid
              ? first
              : null,
        note,
      });
      if (!result.ok) setError(result.error);
      else router.push("/shutdown");
    });
  }

  return (
    <div>
      <Section title="1 · Today" className="mt-4">
        {tasks.length === 0 ? <p className="text-muted">No tasks were planned for today.</p> : null}
        <ul>
          {tasks.map((t) =>
            t.done ? (
              <li key={t.id} className="border-b border-line py-2">
                <span aria-hidden className="me-2">
                  ✓
                </span>
                <UserText>{t.title}</UserText>
              </li>
            ) : (
              <li key={t.id} className="border-b border-line py-2.5">
                <UserText className="block break-words">{t.title}</UserText>
                <span className="block text-sm text-muted">{t.meta}</span>
                <div className="mt-2">
                  <Chips<Choice>
                    legend="Then"
                    options={[
                      { value: "done", label: "Done" },
                      { value: "tomorrow", label: "Tomorrow" },
                      { value: "pick", label: "Pick day" },
                      { value: "drop", label: "Drop" },
                    ]}
                    value={choices[t.id]}
                    onChange={(c) => setChoices({ ...choices, [t.id]: c })}
                  />
                </div>
                {choices[t.id] === "pick" ? (
                  <div className="mt-2 ps-12">
                    <input
                      type="date"
                      aria-label={`Day for ${t.title}`}
                      min={tomorrow}
                      value={pickDays[t.id] ?? tomorrow}
                      onChange={(e) => setPickDays({ ...pickDays, [t.id]: e.target.value })}
                      className="min-h-9 rounded-md border border-line bg-bg px-2 text-sm"
                    />
                  </div>
                ) : null}
                {t.slipCount >= 2 && choices[t.id] !== "drop" && choices[t.id] !== "done" ? (
                  <p className="mt-2 text-sm">
                    Slipped {t.slipCount}×. Make it smaller or drop it?{" "}
                    <Link
                      href={`/tasks/${t.id}?from=/shutdown`}
                      className="underline underline-offset-4"
                    >
                      Edit
                    </Link>
                  </p>
                ) : null}
              </li>
            ),
          )}
        </ul>

        {blocks.length ? (
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[15px]">
                Focus blocks: {Object.values(outcomes).filter((o) => o === "done").length} of{" "}
                {blocks.length} done
              </p>
              <Button
                variant="quiet"
                onClick={() => setOutcomes(Object.fromEntries(blocks.map((b) => [b.id, "done"])))}
              >
                All done
              </Button>
            </div>
            <ul className="mt-1 flex flex-wrap gap-2">
              {blocks.map((b) => {
                const o = outcomes[b.id];
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setOutcomes({ ...outcomes, [b.id]: NEXT_OUTCOME[o ?? "none"] })
                      }
                      aria-label={`${b.time} ${b.title}: ${o ?? "not set"}`}
                      className={cx(
                        "min-h-10 rounded-md border px-3 text-sm",
                        o === "done" ? "border-fg font-semibold" : "border-line",
                        o === "skipped" && "text-muted line-through",
                      )}
                    >
                      {b.time}{" "}
                      {o === "done"
                        ? "✓"
                        : o === "partial"
                          ? "½"
                          : o === "skipped"
                            ? "skipped"
                            : "?"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-sm text-muted">Tap a block to cycle done, partial, skipped.</p>
          </div>
        ) : null}
      </Section>

      <Section title="2 · Habits not logged">{habits}</Section>

      <Section title="3 · Tomorrow's first task">
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Tomorrow&apos;s first task</legend>
          {firstCandidates.map((c) => (
            <label
              key={c.id}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2",
                first?.kind === "existing" && first.taskId === c.id ? "border-fg" : "border-line",
              )}
            >
              <input
                type="radio"
                name="first"
                checked={first?.kind === "existing" && first.taskId === c.id}
                onChange={() => setFirst({ kind: "existing", taskId: c.id })}
                className="mt-1.5"
              />
              <span>
                <UserText className="block">{c.title}</UserText>
                <span className="block text-sm text-muted">{c.meta}</span>
              </span>
            </label>
          ))}
          <label
            className={cx(
              "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2",
              first?.kind === "new" ? "border-fg" : "border-line",
            )}
          >
            <input
              type="radio"
              name="first"
              checked={first?.kind === "new"}
              onChange={() => setFirst({ kind: "new" })}
            />
            <span>A new task</span>
          </label>
        </fieldset>
        {first?.kind === "new" ? (
          <div className="mt-3 space-y-2">
            <Label htmlFor="new-first">New task for tomorrow</Label>
            <TextField
              id="new-first"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={300}
            />
            <Chips
              legend="Goal"
              options={goals.map((g) => ({ value: g.id, label: g.label }))}
              value={newGoal}
              onChange={setNewGoal}
            />
          </div>
        ) : null}
        <p className="mt-3 text-[15px]">
          Tomorrow: {formatMinutes(tomorrowMin)} focus planned of {formatMinutes(capacityMin)}
          {tomorrowMin > capacityMin
            ? ` — over by ${formatMinutes(tomorrowMin - capacityMin)}`
            : ""}
          .
        </p>
        {!gradesTomorrow ? <p className="text-[15px]">No Grades work planned tomorrow.</p> : null}
      </Section>

      <Section title="4 · Note (optional)">
        <label htmlFor="note" className="sr-only">
          Note
        </label>
        <TextArea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={5000}
        />
      </Section>

      {error ? <Notice className="mt-6">{error}</Notice> : null}
      <Button
        variant="primary"
        className="mt-8 w-full"
        disabled={pending || (first?.kind === "new" && !newTitle.trim())}
        onClick={submit}
      >
        {pending ? "Closing…" : "Close the day"}
      </Button>
    </div>
  );
}
