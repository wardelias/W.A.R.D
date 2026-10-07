import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and does an optimistic
 * auth redirect for pages. Real authorization happens in the data layer
 * (getViewer/requireViewer) and in row-level security.
 */

const PUBLIC_PAGES = ["/login", "/auth/callback", "/offline"];

function allowlist(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;

  // API routes do their own checks and must not be redirected to HTML pages.
  if (path.startsWith("/api/")) return response;

  const isPublic = PUBLIC_PAGES.some((p) => path === p || path.startsWith(`${p}/`));

  if (claims) {
    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
    if (!allowlist().includes(email)) {
      await supabase.auth.signOut({ scope: "local" });
      const url = new URL("/login?error=not_allowed", request.url);
      const redirect = NextResponse.redirect(url);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
    if (path === "/login" || path === "/") {
      return withCookies(NextResponse.redirect(new URL("/today", request.url)), response);
    }
    return response;
  }

  if (!isPublic) {
    const url = new URL("/login", request.url);
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    return withCookies(NextResponse.redirect(url), response);
  }

  return response;
}

function withCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export const config = {
  matcher: [
    // Everything except static assets, the PWA files and the cron endpoint.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|api/cron).*)",
  ],
};
