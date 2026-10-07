"use client";

import { useState, useTransition } from "react";
import { UserText } from "@/components/ui";
import { resolveEarlierTaskAction } from "@/server/actions/today";

type Item = { id: string; title: string; meta: string };

/** Tasks left open on earlier days: bring each to today or drop it. */
export function EarlierTasks({ items }: { items: Item[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(id: string, choice: "today" | "drop") {
    setError(null);
    startTransition(async () => {
      const result = await resolveEarlierTaskAction(id, choice);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <ul>
      {items.map((t) => (
        <li key={t.id} className="border-b border-line py-2">
          <UserText className="block break-words">{t.title}</UserText>
          <span className="block text-sm text-muted">{t.meta}</span>
          <span className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => resolve(t.id, "today")}
              className="min-h-9 rounded-md border border-line px-3 text-sm"
              aria-label={`Move to today: ${t.title}`}
            >
              Today
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => resolve(t.id, "drop")}
              className="min-h-9 rounded-md px-3 text-sm text-muted"
              aria-label={`Drop: ${t.title}`}
            >
              Drop
            </button>
          </span>
        </li>
      ))}
      {error ? <li className="pt-2 text-sm">{error}</li> : null}
    </ul>
  );
}
