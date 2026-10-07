import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { syncIfStale } from "@/server/google/sync";
import { createAdminClient } from "@/server/supabase/admin";

/** Called every 5 minutes by pg_cron (see supabase/migrations/*_sync.sql). */
export async function POST(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: accounts } = await admin
    .from("google_accounts")
    .select("user_id")
    .eq("status", "active")
    .limit(50);
  let synced = 0;
  let failed = 0;
  for (const { user_id } of accounts ?? []) {
    try {
      // Sync at most every 15 minutes per user; app opens sync sooner.
      if (await syncIfStale(admin, user_id, 15 * 60)) synced++;
    } catch {
      failed++;
    }
  }
  return NextResponse.json({ synced, failed });
}
