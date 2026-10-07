import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for Google tokens at rest. Format: "v1:<iv>:<ciphertext>:<tag>"
 * (base64url parts). The version prefix allows key rotation later.
 */

const VERSION = "v1";

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function encryptToken(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, ciphertext, tag]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(":");
}

export function decryptToken(sealed: string, base64Key: string): string {
  const [version, iv, ciphertext, tag] = sealed.split(":");
  if (version !== VERSION || !iv || !ciphertext || !tag)
    throw new Error("Unrecognized token format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFrom(base64Key),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
