import pg from "pg";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e@ward.local";

/** Starts every run from a clean test user (deleting cascades to all their data). */
export default async function globalSetup() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query("delete from auth.users where email = $1", [E2E_EMAIL]);
  } finally {
    await client.end();
  }
}
