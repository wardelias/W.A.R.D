# W.A.R.D.

A personal productivity app built around a short daily loop. In the morning, one Today screen shows the calendar, habits and top 3 tasks, and you pick the one thing. During the day you work in focus blocks and log habits with one tap. At night a one-minute shutdown closes the day.

Phase 1 (Core) is built. The plan it follows is in [docs/phase-1-plan.md](docs/phase-1-plan.md), and ideas parked for later are in [BACKLOG.md](BACKLOG.md).

## What Phase 1 includes

- **Sign-in**: Google or a 6-digit email code, limited to an allowlist of emails.
- **Today**:
  - the one thing for the day, the top 3 tasks and quick add;
  - a plan check that appears when the day is over capacity or has no Grades work, and always proposes a fix;
  - tasks left open on earlier days;
  - the calendar, today's habits, and a "Now" line during a focus block.
- **Tasks**: every task has a goal-ladder tag, plus an estimate, a planned day and a due date. Tasks are dropped rather than deleted, and each move during the check-in counts as a slip.
- **Habits**: each habit has a required minimum version. Streaks have grace: one miss per week is forgiven, but never two in a row. After a miss the app prompts "never miss twice". Each habit has a detail page with honest 30-day numbers and a history grid.
- **Night check-in**: decide what happens to unfinished tasks, record focus-block outcomes, log habits you missed logging, set tomorrow's first task, and add an optional note. Closing it saves a daily review with stats.
- **Week**: each day's planned focus against your capacity, with flags and a one-tap fix per day.
- **Google Calendar** (two-way for W.A.R.D.'s own calendar):
  - Your other calendars are read-only.
  - Focus and habit blocks go to a calendar the app creates, named "W.A.R.D.".
  - Every write to Google is previewed first.
  - Moves and deletions you make in Google flow back into the app.
- **Notifications**: Web Push for habits and the shutdown reminder, at most 4 a day and never during a focus block. Google Calendar popups also fire when a block starts.
- **Settings and first-run setup**: schedule, focus windows, capacity, goal ladder, theme and Google connection.
- **PWA**: installable on Android and iPhone, with light and dark themes. Hebrew, Arabic and English text renders correctly everywhere, including mixed lines.

## Run it locally

You need Node 22, pnpm 10 and Docker.

```bash
pnpm install
pnpm db:start                 # local Supabase (Postgres, Auth, mail catcher); prints keys
cp .env.example .env.local    # then fill it in (see below)
pnpm dev                      # http://localhost:3000
```

For local use, fill in `.env.local` like this:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: copy from the output of `pnpm db:start`, or run `pnpm exec supabase status`.
- `ALLOWED_EMAILS`: your email. Any address works locally because no real email is sent.
- `CRON_SECRET`: generate with `openssl rand -hex 32`.
- `CALENDAR_PROVIDER=fake`: uses an in-memory Google Calendar, so you can try everything without Google.
- `TOKEN_ENCRYPTION_KEY`: generate with `openssl rand -base64 32`.

To sign in, enter your email at `/login`. The 6-digit code arrives in the local mail catcher at <http://127.0.0.1:54324>.

## Tests

| Command                                            | What it runs                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                        | Unit tests: business rules (days and time zones, streaks with grace, capacity and overload fixes, free slots, nudges, text handling), validation and formatting.                                        |
| `pnpm test:db`                                     | Needs `pnpm db:start`. Row-level-security tests for every table, Google sync integration tests against the fake calendar, and service tests with a real signed-in client.                               |
| `pnpm test:e2e`                                    | Builds and starts the app with the fake calendar, then runs Playwright at phone (Pixel 7) and desktop sizes. Needs `pnpm db:start`. If your Chromium differs from Playwright's, set `PW_CHROMIUM_PATH`. |
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | Static checks.                                                                                                                                                                                          |

CI (GitHub Actions) runs all of these on every push.

## Environment variables

| Name                                                                 | Where                    | Purpose                                                                |
| -------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                | public                   | The app's URL, no trailing slash. Used for OAuth redirects.            |
| `NEXT_PUBLIC_SUPABASE_URL`                                           | public                   | Supabase project URL.                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                               | public                   | Supabase publishable (anon) key.                                       |
| `SUPABASE_SECRET_KEY`                                                | server                   | Service-role key. Used only for Google tokens, sync and the scheduler. |
| `ALLOWED_EMAILS`                                                     | server                   | Comma-separated emails allowed to sign in.                             |
| `CRON_SECRET`                                                        | server                   | Bearer secret for `/api/cron/tick`, 32+ characters.                    |
| `CALENDAR_PROVIDER`                                                  | server                   | `google` in production; `fake` for local use and tests.                |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                           | server                   | OAuth client for the Calendar connection.                              |
| `TOKEN_ENCRYPTION_KEY`                                               | server                   | 32 random bytes, base64. Encrypts Google tokens (AES-256-GCM).         |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | public / server / server | Web Push keys. Generate with `pnpm dlx web-push generate-vapid-keys`.  |
| `E2E_TEST_ROUTES`                                                    | server                   | Tests only. Never set it in production.                                |

## Deploy

### 1. Supabase

1. Create a project, then link it and push the migrations:
   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push
   ```
2. Under **Auth → URL configuration**, set the Site URL to your app URL, and add `https://<app>/auth/callback` to the redirect URLs.
3. Under **Auth → Email templates**, use `{{ .Token }}` in the Magic link and Confirm signup templates, so the email carries a code. Copy `supabase/templates/code.html`.
4. Under **Auth → Providers → Google**, enable Google with the OAuth client from step 2.
5. After your first sign-in, turn off **Allow new users to sign up**.

### 2. Google Cloud

1. Create a project and enable the **Google Calendar API**.
2. Set up the **OAuth consent screen**:
   - User type: External.
   - Add the scopes `calendar.app.created`, `calendar.events.readonly` and `calendar.calendarlist.readonly`.
   - Set the publishing status to **In production**. In Testing mode, Google expires refresh tokens after 7 days. While the app is unverified you will see an "unverified app" warning once; that's expected for a personal app with fewer than 100 users.
3. Create an **OAuth client** of type Web application, with these authorized redirect URIs:
   - `https://<ref>.supabase.co/auth/v1/callback` (Google sign-in)
   - `https://<app>/api/google/callback` (Calendar connection)

### 3. Vercel

Import the repository, set the environment variables from the table above (with `CALENDAR_PROVIDER=google`), and deploy.

### 4. Scheduler (every 5 minutes)

`pg_cron` calls `/api/cron/tick`. Store the URL and secret once in Supabase Vault (SQL editor):

```sql
select vault.create_secret('https://<app>', 'ward_app_url');
select vault.create_secret('<CRON_SECRET>', 'ward_cron_secret');
```

Until both secrets exist, the scheduled job does nothing.

### 5. On your phone

- **Android (Chrome)**: menu → Install app.
- **iPhone (Safari)**: Share → Add to Home Screen. Web Push only works from the installed app, so turn notifications on there, under Settings → Notifications.

## Manual checklist with a real Google account and phone

These are the steps the automated tests can't run against real Google or a real phone:

1. Connect Google Calendar in Settings. Accept all three permissions. A calendar named "W.A.R.D." appears in Google Calendar.
2. Add a focus block from Today. It appears in the W.A.R.D. calendar with the title "Focus · …" and a popup at its start time.
3. Move that event in Google Calendar, then open W.A.R.D. Within a minute the block shows the new time.
4. Delete the event in Google Calendar. After the next sync it's gone from W.A.R.D.
5. Create an event directly in the W.A.R.D. calendar. It shows up as an untagged focus block.
6. Turn on notifications on the phone and tap "Send a test".
7. Create a habit with a time a few minutes from now. A nudge arrives within about 5 minutes of that time. On Android, tapping "Done" logs it.
8. Disconnect Google Calendar in Settings. The app loses access (check Google Account → Security → Third-party access).

## How it works

```
src/domain/         Pure rules, no I/O, unit-tested (day, habits, capacity, slots, nudges, text)
src/server/
  services/         Typed functions that read and write data. They validate their own input,
                    so Phase 2 assistant tools can wrap them 1:1.
  actions/          Server Actions: authenticate, call a service, refresh the screen
  google/           OAuth, encrypted tokens, Google and fake providers, two-way sync
  push/             Web Push sending and the nudge runner
  supabase/         User client (row-level security applies) and service-role client
src/app/            Screens (App Router) and API routes (OAuth, cron, push action, test-only)
supabase/           Migrations (schema, RLS, functions, pg_cron), config, email template
tests/              unit/, db/ (RLS), integration/ (sync, services, nudges), e2e/ (Playwright)
```

**Data and security**

- Every table has row-level security, and composite foreign keys stop rows from pointing at another user's data.
- Google tokens are encrypted in the app and live in a table only the service role can read.
- Every input is validated with zod and normalized (NFC, code-point limits, bidi marks kept).
- The Content-Security-Policy blocks framing and third-party scripts.

**Sync**

- Each change to a block is saved as "pending" and pushed right away. If the push fails, the next sync retries it.
- Inserts use the block id as the Google event id, so a retried insert can never create a duplicate.
- Patches are checked against the event's ETag.
- If both sides changed, the newer change wins. A deletion in Google always wins.
- Outside calendars are re-read for a window from 7 days back to 35 days ahead.
- Sync runs when you open a screen (at most once a minute), when you tap "Sync now", and every 5 minutes.

**Time**: there is one logical-day function (time zone, plus the day ending at 04:00), and everything uses it.

## Changes from the plan made while building

- **RLS tests**: written with Vitest and `pg` instead of pgTAP. The coverage is the same, with one test runner.
- **Next.js 16**: middleware is now called `proxy.ts`, and pages use Cache Components (session reads sit behind Suspense).
  - Partial Prerendering can't use per-request CSP nonces, so the CSP is header-based. It allows inline scripts for Next's own payload and the pre-paint theme script, and nothing third-party.
- **Habit blocks**: only daily and chosen-days habits get calendar blocks. "N per week" habits have no fixed day to put a block on.
- **Extra schema**:
  - `calendar_blocks.changed_at` and `google_event_id`, for conflict handling and importing events created in Google;
  - `google_accounts.last_synced_at`;
  - push tables and `nudges_sent`;
  - `settings.nudge_*`;
  - a `reorder_goals` function.
- **Slips**: moving a task through the overload fix is planning, so it doesn't count as a slip. Moving it during the check-in or from "Left from earlier" does.
