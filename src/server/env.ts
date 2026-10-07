import "server-only";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optional = (schema: z.ZodString) => z.preprocess(emptyToUndefined, schema.optional());

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  ALLOWED_EMAILS: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),
  CALENDAR_PROVIDER: z.enum(["google", "fake"]).default("google"),
  // Needed from step 10 (Google Calendar). Checked where they are used.
  GOOGLE_CLIENT_ID: optional(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
  TOKEN_ENCRYPTION_KEY: optional(z.string().min(1)),
  // Needed from step 15 (Web Push).
  VAPID_PRIVATE_KEY: optional(z.string().min(1)),
  VAPID_SUBJECT: optional(z.string().min(1)),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}

/** Returns a required value or throws a clear configuration error. */
export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key];
  if (value === undefined || value === null) {
    throw new Error(`Missing environment variable ${String(key)}. See .env.example.`);
  }
  return value as NonNullable<ServerEnv[K]>;
}
