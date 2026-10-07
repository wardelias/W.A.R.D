import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { getViewer, safeNextPath } from "@/server/auth";
import { requireEnv } from "@/server/env";
import { saveConnection } from "@/server/google/accounts";
import {
  exchangeCode,
  idTokenClaims,
  missingScopes,
  OAUTH_COOKIE,
  OAuthError,
  revokeToken,
} from "@/server/google/oauth";
import { setupCalendars } from "@/server/google/setup";
import { syncUser } from "@/server/google/sync";
import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";

function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function back(request: NextRequest, result: string, next = "/settings") {
  const url = new URL(next, request.url);
  url.searchParams.set("google", result);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google" });
  return response;
}

/** Google redirects here after consent. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login?next=/settings", request.url));

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(request, "denied");

  let saved: { state: string; codeVerifier: string; userId: string; next?: string };
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? "");
  } catch {
    return back(request, "expired");
  }
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  if (!code || !saved?.state || !sameString(state, saved.state) || saved.userId !== viewer.id) {
    return back(request, "expired");
  }

  try {
    const tokens = await exchangeCode({
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirectUri: new URL("/api/google/callback", publicEnv().NEXT_PUBLIC_APP_URL).toString(),
      code,
      codeVerifier: saved.codeVerifier,
    });
    if (missingScopes(tokens.scope).length > 0) {
      // The user unticked a calendar permission on the consent screen.
      await revokeToken(tokens.access_token);
      return back(request, "scopes");
    }
    const claims = idTokenClaims(tokens.id_token);
    if (!claims || !tokens.refresh_token) return back(request, "failed");

    const admin = createAdminClient();
    await saveConnection(admin, viewer.id, {
      sub: claims.sub,
      email: claims.email,
      scopes: tokens.scope.split(/\s+/),
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    });
    const db = await createClient();
    const { data } = await db
      .from("settings")
      .select("timezone, day_rollover")
      .eq("user_id", viewer.id)
      .single();
    await setupCalendars(admin, viewer.id, data?.timezone ?? "UTC");
    await syncUser(admin, viewer.id).catch(() => {
      // First sync failing isn't fatal; the next sync retries.
    });
    return back(request, "connected", safeNextPath(saved.next, "/settings"));
  } catch (e) {
    console.error("[google] connect failed", e instanceof OAuthError ? e.code : (e as Error).name);
    return back(request, "failed");
  }
}
