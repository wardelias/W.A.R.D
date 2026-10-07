import { afterEach, describe, expect, it, vi } from "vitest";

const base = {
  SUPABASE_SECRET_KEY: "secret",
  ALLOWED_EMAILS: " Me@Example.com , other@example.com,",
  CRON_SECRET: "x".repeat(32),
};

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(env: Record<string, string>) {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const mod = await import("@/server/env");
    return mod;
  }

  it("parses the allowlist into lowercase trimmed emails", async () => {
    const { serverEnv } = await load(base);
    expect(serverEnv().ALLOWED_EMAILS).toEqual(["me@example.com", "other@example.com"]);
  });

  it("defaults the calendar provider to google", async () => {
    const { serverEnv } = await load(base);
    expect(serverEnv().CALENDAR_PROVIDER).toBe("google");
  });

  it("rejects a short cron secret", async () => {
    const { serverEnv } = await load({ ...base, CRON_SECRET: "short" });
    expect(() => serverEnv()).toThrow(/CRON_SECRET/);
  });

  it("treats empty optional values as missing and requireEnv names them", async () => {
    const { requireEnv } = await load({ ...base, GOOGLE_CLIENT_ID: "" });
    expect(() => requireEnv("GOOGLE_CLIENT_ID")).toThrow(/GOOGLE_CLIENT_ID/);
  });
});
