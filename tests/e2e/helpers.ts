import { expect, type Locator, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e@ward.local";
export const STORAGE_STATE = "tests/e2e/.auth/state.json";

type MailSummary = { ID: string; Created: string; To: { Address: string }[] };

async function latestCode(email: string, after: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=20`);
    const body = (await res.json()) as { messages: MailSummary[] };
    const mail = body.messages.find(
      (m) => m.To.some((t) => t.Address === email) && Date.parse(m.Created) >= after - 1000,
    );
    if (mail) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json()) as {
        Text: string;
      };
      const match = full.Text.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

/** Signs in through the real email-code flow (local Supabase + Mailpit). */
export async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  const startedAt = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  const code = await latestCode(email, startedAt);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(today|welcome)/);
}

/** Taps a visible chip (the label of a hidden radio) and waits until it's selected. */
export async function choose(scope: Page | Locator, label: string) {
  const chip = scope.locator("label").filter({ hasText: new RegExp(`^${label}$`) });
  await chip.first().click();
  await expect(chip.first().locator('input[type="radio"]')).toBeChecked();
}

/** The quick-add form. */
export function quickAdd(page: Page) {
  return page.locator("form").filter({ has: page.getByLabel("Add a task") });
}

/** Clears the test user's planning data (keeps the account and session). */
export async function resetUserData(email = E2E_EMAIL) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString:
      process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  await client.connect();
  try {
    await client.query(
      `with u as (select id from auth.users where email = $1)
       , a as (delete from public.calendar_blocks where user_id in (select id from u))
       , b as (delete from public.day_plans where user_id in (select id from u))
       , c as (delete from public.reviews where user_id in (select id from u))
       , d as (delete from public.habit_logs where user_id in (select id from u))
       select 1`,
      [email],
    );
    await client.query(
      `delete from public.tasks where user_id in (select id from auth.users where email = $1)`,
      [email],
    );
    await client.query(
      `delete from public.habits where user_id in (select id from auth.users where email = $1)`,
      [email],
    );
    await client.query(
      `delete from public.google_accounts where user_id in (select id from auth.users where email = $1)`,
      [email],
    );
    await client.query(
      `delete from public.calendars where user_id in (select id from auth.users where email = $1)`,
      [email],
    );
    // Settings and the goal ladder back to their defaults (keeps onboarding state).
    await client.query(
      `update public.settings set timezone = 'Asia/Jerusalem', day_rollover = '04:00', week_start = 0,
         wake_time = '10:00', shutdown_time = '22:30',
         focus_windows = '[{"start":"11:00","end":"15:00"},{"start":"18:00","end":"22:00"}]',
         focus_block_min = 45, break_min = 15, focus_capacity_min = 360, block_reminders = true, theme = 'system'
       where user_id in (select id from auth.users where email = $1)`,
      [email],
    );
    await client.query(
      `with u as (select id from auth.users where email = $1)
       update public.goals g set title = d.title, label = d.label
       from (values (1, 'University grades', 'Grades'), (2, 'AI agency & voice AI', 'Agency'),
                    (3, 'Health: gym, food, sleep', 'Health')) as d(rank, title, label)
       where g.user_id in (select id from u) and g.rank = d.rank`,
      [email],
    );
  } finally {
    await client.end();
  }
}

/** Changes the fake calendar "in Google" (test-only route, fake mode only). */
export async function fakeGoogle(page: Page, body: Record<string, unknown>) {
  const res = await page.request.post("/api/test/fake-calendar", { data: body });
  expect(res.ok()).toBe(true);
  return res.json();
}

/** Connects the fake Google Calendar through Settings. */
export async function connectGoogle(page: Page) {
  // Start from an empty fake Google account.
  await fakeGoogle(page, { op: "reset" });
  await goto(page, "/settings");
  await page.getByRole("link", { name: "Connect Google Calendar" }).click();
  await expect(page.getByText("Google Calendar connected.")).toBeVisible();
}

/** The user's logical "today" (Asia/Jerusalem, 04:00 rollover) as YYYY-MM-DD, plus n days. */
export function logicalDate(addDays = 0, timeZone = "Asia/Jerusalem"): string {
  const shifted = new Date(Date.now() - 4 * 3_600_000);
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
  const d = new Date(`${local}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10);
}

export function blockIdFromEventId(eventId: string): string {
  return `${eventId.slice(0, 8)}-${eventId.slice(8, 12)}-${eventId.slice(12, 16)}-${eventId.slice(16, 20)}-${eventId.slice(20)}`;
}

/** Marks first-run setup as done (or not) for the test user. */
export async function setOnboarded(done: boolean, email = E2E_EMAIL) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString:
      process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  await client.connect();
  try {
    await client.query(
      `update public.settings set onboarded_at = ${done ? "now()" : "null"}
       where user_id in (select id from auth.users where email = $1)`,
      [email],
    );
  } finally {
    await client.end();
  }
}

/** Full page load, then wait until React has hydrated (so inputs keep what tests type). */
export async function goto(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
}
