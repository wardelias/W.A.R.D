import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Google OAuth for Calendar access (authorization code + PKCE, offline).
 * Separate from sign-in, so login keeps minimal scopes.
 */

export const CALENDAR_SCOPES = [
  "openid",
  "email",
  // Create the "W.A.R.D." calendar and manage events in it (and only it).
  "https://www.googleapis.com/auth/calendar.app.created",
  // Read events from the calendars the user chooses to show.
  "https://www.googleapis.com/auth/calendar.events.readonly",
  // List calendars so the user can pick which to show.
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

/** Scopes without which the calendar features can't work. */
export const REQUIRED_SCOPES = CALENDAR_SCOPES.filter((s) => s.startsWith("https://"));

/** Short-lived cookie holding state + PKCE verifier during the consent round trip. */
export const OAUTH_COOKIE = "ward_google_oauth";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  loginHint?: string;
}): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", pkceChallenge(opts.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
};

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !json.access_token) {
    throw new OAuthError(`Token request failed (${res.status})`, json.error ?? "unknown");
  }
  return json as TokenResponse;
}

export function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
}

export function refreshAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
  });
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
  }).catch(() => {
    // Best effort: the local tokens are deleted either way.
  });
}

/**
 * Reads email and subject from an ID token received directly from Google's
 * token endpoint over TLS (OIDC allows skipping signature checks in that case).
 */
export function idTokenClaims(idToken: string | undefined): { sub: string; email: string } | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function missingScopes(granted: string): string[] {
  const set = new Set(granted.split(/\s+/));
  return REQUIRED_SCOPES.filter((s) => !set.has(s));
}
