import { randomUUID } from "node:crypto";
import pg from "pg";

export const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

/** Creates an auth user directly (the signup trigger seeds settings + goals). */
export async function createUser(email = `${randomUUID()}@test.local`): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       $2, '', now(), '{}', '{}', now(), now())`,
    [id, email],
  );
  return id;
}

export async function deleteUser(id: string) {
  await pool.query("delete from auth.users where id = $1", [id]);
}

type Role = "authenticated" | "anon";

/**
 * Runs `fn` inside a transaction as the given role, with the JWT claims
 * Supabase would set for that user. Always rolled back.
 */
export async function as<T>(
  role: Role,
  userId: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    const claims = userId ? { sub: userId, role } : { role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    return await fn((sql, params) => client.query(sql, params as unknown[]));
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Runs as the table owner (bypasses RLS) to arrange fixtures. */
export async function admin(sql: string, params?: unknown[]) {
  return pool.query(sql, params as unknown[]);
}

export async function goalIds(userId: string): Promise<string[]> {
  const { rows } = await admin("select id from public.goals where user_id = $1 order by rank", [
    userId,
  ]);
  return rows.map((r) => r.id as string);
}
