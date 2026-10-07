import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/server/env";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses row-level security, so every query MUST be
 * filtered by a user id that came from a verified session or a trusted job.
 * Used only for Google tokens, calendar sync and scheduled jobs.
 */
export function createAdminClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type AdminClient = ReturnType<typeof createAdminClient>;
