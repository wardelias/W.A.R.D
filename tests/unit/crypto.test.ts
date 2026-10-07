import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/server/google/crypto";

const key = randomBytes(32).toString("base64");

describe("token encryption", () => {
  it("round-trips and never contains the plain token", () => {
    const sealed = encryptToken("1//refresh-token-value", key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("refresh-token-value");
    expect(decryptToken(sealed, key)).toBe("1//refresh-token-value");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = encryptToken("secret", key);
    const parts = sealed.split(":");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join(":"), key)).toThrow();
    expect(() => decryptToken(sealed, randomBytes(32).toString("base64"))).toThrow();
  });

  it("rejects keys that aren't 32 bytes", () => {
    expect(() => encryptToken("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
