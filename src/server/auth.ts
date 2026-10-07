import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { serverEnv } from "@/server/env";
import { createClient } from "@/server/supabase/server";

export type Viewer = { id: string; email: string };

export function isAllowedEmail(email: string | undefined | null, allowlist: string[]): boolean {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/**
 * The signed-in, allowlisted user for this request, or null.
 * Verifies the session JWT (not just its presence). Deduplicated per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Session checks read the clock and cookies: always render at request time.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  if (!isAllowedEmail(email, serverEnv().ALLOWED_EMAILS)) return null;
  return { id: data.claims.sub, email: email! };
});

/** Like getViewer, but redirects to the login page when nobody is signed in. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** Only same-origin relative paths are allowed as post-login destinations. */
export function safeNextPath(next: string | null | undefined, fallback = "/today"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
