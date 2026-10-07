"use client";

import { useState, useTransition } from "react";
import { Button, buttonClass, Notice } from "@/components/ui";
import {
  disconnectGoogleAction,
  setCalendarShownAction,
  syncNowAction,
} from "@/server/actions/calendar";

type Calendar = {
  id: string;
  summary: string;
  selected: boolean;
  isWard: boolean;
  lastError: string | null;
};

export function GoogleSettings({
  connected,
  needsReconnect,
  email,
  lastSync,
  calendars,
}: {
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
  lastSync: string | null;
  calendars: Calendar[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removeWard, setRemoveWard] = useState(false);
  const [shown, setShown] = useState<Record<string, boolean>>(
    Object.fromEntries(calendars.map((c) => [c.id, c.selected])),
  );

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? (done ?? null) : (result.error ?? "Something went wrong."));
    });
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <p className="text-[15px]">
          W.A.R.D. reads the calendars you choose and writes only to its own calendar, named
          “W.A.R.D.”. Your other events stay untouched.
        </p>
        <a href="/api/google/connect" className={buttonClass("primary")}>
          Connect Google Calendar
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px]">
        Connected as <bdi>{email}</bdi>
        {lastSync ? <span className="text-muted"> · last sync {lastSync}</span> : null}
      </p>
      {needsReconnect ? (
        <Notice>
          Google Calendar access stopped working.{" "}
          <a href="/api/google/connect" className="underline underline-offset-4">
            Reconnect
          </a>
        </Notice>
      ) : null}
      <Button disabled={pending} onClick={() => act(syncNowAction, "Synced.")}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>

      <fieldset>
        <legend className="mb-1 text-sm text-muted">Show events from</legend>
        <ul>
          {calendars
            .filter((c) => !c.isWard)
            .map((c) => (
              <li key={c.id}>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={shown[c.id] ?? c.selected}
                    disabled={pending}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setShown({ ...shown, [c.id]: next });
                      act(() => setCalendarShownAction(c.id, next));
                    }}
                  />
                  <bdi>{c.summary}</bdi>
                  {c.lastError ? (
                    <span className="text-sm text-muted">· couldn&apos;t read</span>
                  ) : null}
                </label>
              </li>
            ))}
        </ul>
        <p className="mt-1 text-sm text-muted">
          Focus and habit blocks go to the “W.A.R.D.” calendar.
        </p>
      </fieldset>

      {confirming ? (
        <Notice>
          <p>
            Disconnect Google Calendar? W.A.R.D. stops reading your calendars and stops writing
            blocks. Your blocks stay in W.A.R.D.
          </p>
          <label className="mt-2 flex items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={removeWard}
              onChange={(e) => setRemoveWard(e.target.checked)}
            />
            Also delete the “W.A.R.D.” calendar from Google
          </label>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => act(() => disconnectGoogleAction(removeWard), "Disconnected.")}
            >
              Disconnect
            </Button>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </Notice>
      ) : (
        <Button variant="quiet" className="-ms-3 text-muted" onClick={() => setConfirming(true)}>
          Disconnect…
        </Button>
      )}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
