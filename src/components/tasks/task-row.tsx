"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { cx, UserText } from "@/components/ui";
import { setTaskStatusAction } from "@/server/actions/tasks";

export type TaskRowData = {
  id: string;
  title: string;
  done: boolean;
  /** Plain-text details, already formatted: "Grades · 90m · Today". */
  meta: string[];
};

/** One task: a tap target to check it off, and the title linking to its edit page. */
export function TaskRow({ task, returnTo }: { task: TaskRowData; returnTo?: string }) {
  const [done, setDone] = useOptimistic(task.done);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !done;
    setError(null);
    startTransition(async () => {
      setDone(next);
      const result = await setTaskStatusAction(task.id, next ? "done" : "open");
      if (!result.ok) setError(result.error);
    });
  }

  const href = returnTo
    ? `/tasks/${task.id}?from=${encodeURIComponent(returnTo)}`
    : `/tasks/${task.id}`;

  return (
    <li className="flex items-start gap-3 border-b border-line py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${task.title}`}
        onClick={toggle}
        className="-ms-1 flex size-11 shrink-0 items-center justify-center"
      >
        <span
          aria-hidden
          className={cx(
            "flex size-5 items-center justify-center rounded border text-[13px] leading-none",
            done ? "border-fg bg-fg text-bg" : "border-muted",
          )}
        >
          {done ? "✓" : ""}
        </span>
      </button>
      <Link href={href} className="min-w-0 flex-1 py-2">
        <UserText className={cx("block break-words", done && "text-muted line-through")}>
          {task.title}
        </UserText>
        {task.meta.length ? (
          <span className="mt-0.5 block text-sm text-muted">{task.meta.join(" · ")}</span>
        ) : null}
        {error ? <span className="mt-1 block text-sm">{error}</span> : null}
      </Link>
    </li>
  );
}
