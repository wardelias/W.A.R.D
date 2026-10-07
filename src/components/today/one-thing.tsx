"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonClass, Notice, UserText } from "@/components/ui";
import { setOneThingAction } from "@/server/actions/today";

type Candidate = { id: string; title: string; meta: string };

/** The single most important task of the day. One tap to pick or change it. */
export function OneThing({
  day,
  current,
  setBeforeDay,
  candidates,
}: {
  day: string;
  current: Candidate | null;
  setBeforeDay: boolean;
  candidates: Candidate[];
}) {
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(taskId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setOneThingAction(day, taskId);
      if (!result.ok) setError(result.error);
      else setPicking(false);
    });
  }

  if (current && !picking) {
    return (
      <div>
        <p className="text-[17px] font-semibold">
          <UserText>{current.title}</UserText>
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {current.meta}
          {setBeforeDay ? " · set last night" : ""}
        </p>
        <div className="mt-2 flex gap-2">
          <Link href={`/focus/new?task=${current.id}`} className={buttonClass("plain")}>
            Schedule
          </Link>
          <Button variant="quiet" onClick={() => setPicking(true)}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  const options = candidates.filter((c) => c.id !== current?.id);
  return (
    <div>
      <p className="mb-2 text-[15px]">
        {current ? "Pick a different one thing:" : "Pick the one thing for today:"}
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted">Add a task for today first.</p>
      ) : (
        <ul className="space-y-1.5">
          {options.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => pick(c.id)}
                className="w-full rounded-md border border-line px-3 py-2 text-start disabled:opacity-50"
              >
                <UserText className="block">{c.title}</UserText>
                <span className="block text-sm text-muted">{c.meta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {current ? (
        <Button variant="quiet" className="mt-1 -ms-3" onClick={() => setPicking(false)}>
          Keep current
        </Button>
      ) : null}
      {error ? <Notice className="mt-2">{error}</Notice> : null}
    </div>
  );
}
