import "server-only";
import { refresh } from "next/cache";
import { getContext, ServiceError, type Ctx } from "@/server/context";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Runs a service call for a Server Action: authenticates (getContext
 * re-verifies the session every time), maps errors to a safe message,
 * and refreshes the current route so the UI shows the change.
 */
export async function run<T>(fn: (ctx: Ctx) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const ctx = await getContext();
    const data = await fn(ctx);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, error: error.message };
    // redirect() and notFound() throw special errors that must propagate.
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[action] unexpected error", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
