"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestPushAction,
  setNudgePrefsAction,
} from "@/server/actions/push";

type DeviceState = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function base64ToBytes(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function NotificationSettings({
  vapidPublicKey,
  habits,
  shutdown,
}: {
  vapidPublicKey: string | null;
  habits: boolean;
  shutdown: boolean;
}) {
  const [device, setDevice] = useState<DeviceState>("checking");
  const [prefs, setPrefs] = useState({ habits, shutdown });
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let state: DeviceState;
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        state = isIos() && !isStandalone() ? "needs-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        state = "blocked";
      } else {
        const reg = await navigator.serviceWorker.ready;
        state = (await reg.pushManager.getSubscription()) ? "on" : "off";
      }
      if (!cancelled) setDevice(state);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function turnOn() {
    setMessage(null);
    startTransition(async () => {
      if (!vapidPublicKey) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToBytes(vapidPublicKey) as BufferSource,
        });
        const result = await savePushSubscriptionAction(sub.toJSON());
        if (!result.ok) setMessage(result.error);
        else setDevice("on");
      } catch {
        setMessage("This browser couldn't turn on notifications.");
      }
    });
  }

  function turnOff() {
    setMessage(null);
    startTransition(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setDevice("off");
    });
  }

  function savePrefs(next: { habits: boolean; shutdown: boolean }) {
    setPrefs(next);
    startTransition(async () => {
      const result = await setNudgePrefsAction(next);
      if (!result.ok) setMessage(result.error);
    });
  }

  if (!vapidPublicKey) {
    return (
      <p className="text-[15px] text-muted">
        Notifications aren&apos;t configured on the server yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[15px]">
        At most 4 a day, never during a focus block: a habit at its time if it isn&apos;t logged,
        and the shutdown reminder.
      </p>
      {device === "needs-install" ? (
        <Notice>
          On iPhone, add W.A.R.D. to the Home Screen first (Share → Add to Home Screen), then turn
          notifications on from there.
        </Notice>
      ) : null}
      {device === "unsupported" ? (
        <p className="text-sm text-muted">This browser doesn&apos;t support notifications.</p>
      ) : null}
      {device === "blocked" ? (
        <Notice>
          Notifications are blocked for W.A.R.D. in this browser. Allow them in the browser&apos;s
          site settings.
        </Notice>
      ) : null}
      {device === "off" ? (
        <Button variant="primary" disabled={pending} onClick={turnOn}>
          Turn on for this device
        </Button>
      ) : null}
      {device === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px]">On for this device.</span>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await sendTestPushAction();
                setMessage(r.ok ? "Test sent." : r.error);
              })
            }
          >
            Send a test
          </Button>
          <Button variant="quiet" disabled={pending} onClick={turnOff}>
            Turn off
          </Button>
        </div>
      ) : null}

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5"
          checked={prefs.habits}
          onChange={(e) => savePrefs({ ...prefs, habits: e.target.checked })}
        />
        Habit nudges
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5"
          checked={prefs.shutdown}
          onChange={(e) => savePrefs({ ...prefs, shutdown: e.target.checked })}
        />
        Shutdown reminder
      </label>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
