import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { getViewer } from "@/server/auth";
import { requireEnv } from "@/server/env";
import { isFakeCalendar, saveConnection } from "@/server/google/accounts";
import { buildAuthUrl, OAUTH_COOKIE, randomToken, REQUIRED_SCOPES } from "@/server/google/oauth";
import { setupCalendars } from "@/server/google/setup";
import { syncUser } from "@/server/google/sync";
import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";

/** Starts the Google Calendar consent flow (PKCE + state). */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login?next=/settings", request.url));

  if (isFakeCalendar()) {
    // Local/test mode: connect an in-memory calendar without leaving the app.
    const admin = createAdminClient();
    await saveConnection(admin, viewer.id, {
      sub: `fake-${viewer.id}`,
      email: viewer.email,
      scopes: REQUIRED_SCOPES,
      refreshToken: "fake",
    });
    const db = await createClient();
    const { data } = await db.from("settings").select("timezone").eq("user_id", viewer.id).single();
    await setupCalendars(admin, viewer.id, data?.timezone ?? "UTC");
    await syncUser(admin, viewer.id);
    return NextResponse.redirect(new URL("/settings?google=connected", request.url));
  }

  const state = randomToken();
  const codeVerifier = randomToken(48);
  const redirectUri = new URL("/api/google/callback", publicEnv().NEXT_PUBLIC_APP_URL).toString();
  const response = NextResponse.redirect(
    buildAuthUrl({
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      redirectUri,
      state,
      codeVerifier,
      loginHint: viewer.email,
    }),
  );
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, codeVerifier, userId: viewer.id }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return response;
}
