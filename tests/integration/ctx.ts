import { createClient } from "@supabase/supabase-js";
import { logicalDay } from "@/domain/day";
import { parseFocusWindows, type Ctx } from "@/server/context";
import { createAdminClient } from "@/server/supabase/admin";
import type { Database } from "@/server/supabase/database.types";

/**
 * A service context for a fresh user, with a real signed-in client so
 * row-level security applies exactly as in the app.
 */
export async function userCtx(now = new Date()): Promise<Ctx & { cleanup: () => Promise<void> }> {
  const admin = createAdminClient();
  const email = `${crypto.randomUUID()}@test.local`;
  const password = crypto.randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) throw error ?? new Error("createUser failed");
  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error: signInError } = await db.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { data: settings } = await db.from("settings").select("*").single();
  return {
    db: db as unknown as Ctx["db"],
    userId: created.user.id,
    email,
    settings: { ...settings!, focus_windows: parseFocusWindows(settings!.focus_windows) },
    now,
    today: logicalDay(now, settings!.timezone, settings!.day_rollover),
    cleanup: async () => {
      await admin.auth.admin.deleteUser(created.user.id);
    },
  };
}
