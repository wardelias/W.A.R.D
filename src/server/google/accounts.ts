import "server-only";
import { requireEnv, serverEnv } from "@/server/env";
import type { AdminClient } from "@/server/supabase/admin";
import { decryptToken, encryptToken } from "./crypto";
import { fakeProvider } from "./fake-provider";
import { googleProvider } from "./google-provider";
import { OAuthError, refreshAccessToken, revokeToken } from "./oauth";
import type { CalendarProvider } from "./provider";

/**
 * Google account storage. All reads and writes go through the service-role
 * client (the table has no RLS policies), always filtered by a user id that
 * came from a verified session or a trusted job. Tokens are never returned
 * to the browser and never logged.
 */

export type GoogleConnection = {
  email: string;
  status: "active" | "needs_reconnect";
  wardCalendarId: string | null;
  connectedAt: string;
};

export function calendarProvider(): CalendarProvider {
  return serverEnv().CALENDAR_PROVIDER === "fake" ? fakeProvider : googleProvider;
}

export function isFakeCalendar(): boolean {
  return serverEnv().CALENDAR_PROVIDER === "fake";
}

export async function getConnection(
  admin: AdminClient,
  userId: string,
): Promise<GoogleConnection | null> {
  const { data, error } = await admin
    .from("google_accounts")
    .select("email, status, ward_calendar_id, connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`google_accounts read failed: ${error.code}`);
  if (!data) return null;
  return {
    email: data.email,
    status: data.status as GoogleConnection["status"],
    wardCalendarId: data.ward_calendar_id,
    connectedAt: data.connected_at,
  };
}

export async function saveConnection(
  admin: AdminClient,
  userId: string,
  input: {
    sub: string;
    email: string;
    scopes: string[];
    refreshToken: string;
    accessToken?: string;
    expiresIn?: number;
  },
): Promise<void> {
  const key = isFakeCalendar() ? fakeKey() : requireEnv("TOKEN_ENCRYPTION_KEY");
  const { error } = await admin.from("google_accounts").upsert(
    {
      user_id: userId,
      google_sub: input.sub,
      email: input.email,
      scopes: input.scopes,
      refresh_token_enc: encryptToken(input.refreshToken, key),
      access_token_enc: input.accessToken ? encryptToken(input.accessToken, key) : null,
      access_expires_at: input.expiresIn
        ? new Date(Date.now() + (input.expiresIn - 60) * 1000).toISOString()
        : null,
      status: "active",
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`google_accounts write failed: ${error.code}`);
}

export async function setWardCalendar(admin: AdminClient, userId: string, calendarId: string) {
  const { error } = await admin
    .from("google_accounts")
    .update({ ward_calendar_id: calendarId })
    .eq("user_id", userId);
  if (error) throw new Error(`google_accounts write failed: ${error.code}`);
}

/** The fake provider has no real tokens; a fixed key keeps the code path identical. */
function fakeKey(): string {
  return Buffer.alloc(32, 7).toString("base64");
}

export class NeedsReconnect extends Error {
  constructor() {
    super("Google Calendar needs to be reconnected.");
    this.name = "NeedsReconnect";
  }
}

/**
 * A valid access token for the user, refreshing it when needed. On a revoked
 * or expired grant, marks the account as needing reconnection.
 */
export async function accessToken(admin: AdminClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from("google_accounts")
    .select("refresh_token_enc, access_token_enc, access_expires_at, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`google_accounts read failed: ${error.code}`);
  if (!data) throw new NeedsReconnect();
  if (data.status !== "active") throw new NeedsReconnect();

  if (isFakeCalendar()) return userId;

  const key = requireEnv("TOKEN_ENCRYPTION_KEY");
  if (
    data.access_token_enc &&
    data.access_expires_at &&
    new Date(data.access_expires_at) > new Date()
  ) {
    return decryptToken(data.access_token_enc, key);
  }

  try {
    const refreshed = await refreshAccessToken({
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refreshToken: decryptToken(data.refresh_token_enc, key),
    });
    await admin
      .from("google_accounts")
      .update({
        access_token_enc: encryptToken(refreshed.access_token, key),
        access_expires_at: new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString(),
        // Google may rotate refresh tokens; keep the newest.
        ...(refreshed.refresh_token
          ? { refresh_token_enc: encryptToken(refreshed.refresh_token, key) }
          : {}),
      })
      .eq("user_id", userId);
    return refreshed.access_token;
  } catch (e) {
    if (e instanceof OAuthError && e.code === "invalid_grant") {
      await admin
        .from("google_accounts")
        .update({ status: "needs_reconnect" })
        .eq("user_id", userId);
      throw new NeedsReconnect();
    }
    throw e;
  }
}

/**
 * Revokes access at Google and deletes the stored tokens and calendar cache.
 * W.A.R.D.'s own blocks stay (they are the user's plan); optionally the
 * "W.A.R.D." calendar is removed from Google too.
 */
export async function disconnect(
  admin: AdminClient,
  userId: string,
  { removeWardCalendar }: { removeWardCalendar: boolean },
): Promise<void> {
  const { data } = await admin
    .from("google_accounts")
    .select("refresh_token_enc, ward_calendar_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return;

  if (removeWardCalendar && data.ward_calendar_id) {
    try {
      const token = await accessToken(admin, userId);
      await calendarProvider().deleteCalendar(token, data.ward_calendar_id);
    } catch {
      // If access is already gone, the calendar can't be removed from here.
    }
  }
  if (!isFakeCalendar()) {
    try {
      await revokeToken(decryptToken(data.refresh_token_enc, requireEnv("TOKEN_ENCRYPTION_KEY")));
    } catch {
      // Revocation is best effort; local deletion below always happens.
    }
  }
  await admin.from("calendars").delete().eq("user_id", userId);
  await admin
    .from("calendar_blocks")
    .update({
      google_calendar_id: null,
      google_etag: null,
      google_updated_at: null,
      sync_state: "pending",
    })
    .eq("user_id", userId)
    .is("deleted_at", null);
  await admin.from("google_accounts").delete().eq("user_id", userId);
}
