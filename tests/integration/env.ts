// Local Supabase defaults (printed by `supabase start`); overridable from the environment.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??=
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
process.env.SUPABASE_SECRET_KEY ??= "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.ALLOWED_EMAILS ??= "test@ward.local";
process.env.CRON_SECRET ??= "test-cron-secret-0123456789abcdef0123";
process.env.CALENDAR_PROVIDER = "fake";
