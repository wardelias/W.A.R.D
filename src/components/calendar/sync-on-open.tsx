"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncOnOpenAction } from "@/server/actions/calendar";

/**
 * Syncs Google Calendar in the background when the screen opens or comes
 * back into view (at most once a minute, enforced on the server), then
 * refreshes the screen if anything ran.
 */
export function SyncOnOpen() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await syncOnOpenAction();
      if (!cancelled && result.synced) router.refresh();
    }
    void run();
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
