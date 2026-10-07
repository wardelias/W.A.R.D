import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail, safeNextPath } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { createClient } from "@/server/supabase/server";

/** Google sign-in lands here (Supabase PKCE flow). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!code) return NextResponse.redirect(new URL("/login?error=google", request.url));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user)
    return NextResponse.redirect(new URL("/login?error=google", request.url));

  if (!isAllowedEmail(data.user.email, serverEnv().ALLOWED_EMAILS)) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
