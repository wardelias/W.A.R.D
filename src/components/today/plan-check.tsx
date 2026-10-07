"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Button, Notice } from "@/components/ui";
import { applyOverloadFixAction } from "@/server/actions/today";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * An overload warning that always proposes a fix. "Keep" hides it for the
 * rest of the day on this device; the numbers stay on the screen.
 */
export function PlanCheckNotice({
  day,
  lines,
  fixText,
  moveIds,
}: {
  day: string;
  lines: string[];
  fixText: string | null;
  moveIds: string[];
}) {
  const key = `ward:keep-plan:${day}`;
  const kept = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (kept || hidden) return null;

  return (
    <Notice>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {fixText ? <p className="mt-1">{fixText}</p> : null}
      <div className="mt-2 flex gap-2">
        {moveIds.length ? (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await applyOverloadFixAction(day, moveIds);
                if (!result.ok) setError(result.error);
              })
            }
          >
            {pending ? "Moving…" : "Move"}
          </Button>
        ) : null}
        <Button
          onClick={() => {
            try {
              window.localStorage.setItem(key, "1");
            } catch {
              // storage unavailable: hide for this visit only
            }
            setHidden(true);
          }}
        >
          Keep
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm">{error}</p> : null}
    </Notice>
  );
}
