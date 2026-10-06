# W.A.R.D. — Phase 1 Plan (Core)

Status: **draft, waiting for approval** · 2026-10-06

---

## 1. Goal

Phase 1 delivers the daily loop without the assistant. It includes one Today screen, tasks tagged to the goal ladder, habits with minimum versions and grace streaks, a night check-in, two-way Google Calendar sync for W.A.R.D.'s own focus and habit blocks, and an overload warning. The app runs as an installed PWA on a phone and in a desktop browser. The UI is in English, and Hebrew and Arabic text renders correctly everywhere.

**Main flow that must work end to end:**
open Today → confirm the one thing → schedule a focus block for it (it appears in Google Calendar) → log habits with one tap during the day → night check-in in under 2 minutes → the next morning, the first task is waiting.

**Not in Phase 1:** the assistant, notes, search, voice, calls, the weekly review screen, Moodle, Gmail.

---

## 2. Key decisions

| Area | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router), TypeScript strict, Tailwind v4, pnpm | As briefed. Versions get pinned when the project is scaffolded. |
| Hosting | Vercel (Hobby) + Supabase Cloud (free) | No servers to run. |
| Scheduler | Supabase `pg_cron` + `pg_net` call one protected route every 5 min | Vercel Hobby cron runs only once a day. A `pg_cron` job lives in a migration, so it is version-controlled. n8n isn't needed yet. |
| Code layers | `src/domain` holds pure logic. `src/server/services` holds typed functions that read and write data. UI uses Server Components + Server Actions. | In Phase 2, each assistant tool wraps one service function (`create_task` → `services.tasks.create`), so no logic gets written twice. |
| Login | Supabase Auth: Google sign-in (basic scopes), plus a 6-digit email code as fallback. Sign-in is locked to your email. | Email codes work inside an installed iOS PWA. Magic links open Safari instead. |
| Calendar consent | A separate "Connect Google Calendar" step, using our own OAuth code flow (PKCE + state, offline access) | Login keeps the minimum scopes. Supabase doesn't store or refresh Google tokens, so we manage them ourselves. |
| Where blocks live | A dedicated secondary calendar named **"W.A.R.D."**, created by the app | W.A.R.D. never writes to your real calendars. You can show or hide it in Google Calendar, and two-way sync stays contained. |
| Google scopes | `calendar.app.created` (read/write only calendars the app created), `calendar.events.readonly`, `calendar.calendarlist.readonly` | Write access covers only W.A.R.D.'s own calendar. |
| Token storage | AES-256-GCM in the app server with the key in env. The table is readable only by the service role. | A database leak alone doesn't expose tokens. Tokens never reach the browser or the logs. |
| Sync model | Windowed pull (−7 / +35 days) plus an outbox-style push. No Google push channels in Phase 1. | Correct with recurring events, small volume for one user, and much simpler than syncTokens + webhooks. Push channels are in the backlog. |
| Habit blocks | Single events created for the next 7 days, rolling. No recurring Google events. | Avoids handling RRULE exceptions in two-way sync. |
| Google event IDs | Event id = block UUID without hyphens | Inserts become idempotent: a retried create can never duplicate an event. |
| Nudges | Google Calendar popup at block start (works on both phones, no extra infra). Web Push for habit nudges and the shutdown reminder (step 15, can be cut). | |
| Offline | Installable PWA with a cached shell. Writes need a network connection. | An offline write queue is in the backlog. |
| Status fields | `text` + `check` constraints, not Postgres enums | Easier to change later. |

---

## 3. Folder structure

```
W.A.R.D/
├─ README.md                 setup, env vars, run, test
├─ BACKLOG.md                out-of-scope ideas, parked here
├─ .env.example
├─ docs/
│  └─ phase-1-plan.md
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/            0001_core.sql, 0002_calendar.sql, 0003_cron.sql, 0004_push.sql
│  ├─ seed.sql               local dev data (two test users)
│  └─ tests/                 pgTAP: RLS + constraints
├─ src/
│  ├─ app/
│  │  ├─ (public)/login/page.tsx
│  │  ├─ auth/callback/route.ts            Supabase login callback
│  │  ├─ (app)/layout.tsx                  bottom nav, session guard
│  │  ├─ (app)/today/page.tsx
│  │  ├─ (app)/tasks/page.tsx
│  │  ├─ (app)/habits/page.tsx  habits/[id]/page.tsx
│  │  ├─ (app)/week/page.tsx
│  │  ├─ (app)/shutdown/page.tsx           night check-in
│  │  ├─ (app)/settings/page.tsx
│  │  ├─ (app)/welcome/page.tsx            first-run setup
│  │  ├─ api/google/connect/route.ts       starts calendar OAuth
│  │  ├─ api/google/callback/route.ts
│  │  ├─ api/cron/tick/route.ts            pg_cron target (bearer secret)
│  │  ├─ api/push/subscribe/route.ts
│  │  ├─ manifest.ts
│  │  ├─ layout.tsx  globals.css
│  ├─ domain/                pure logic, no I/O, 100% unit-tested
│  │  ├─ day.ts              logical day, time zone, rollover
│  │  ├─ schedule.ts         which days a habit is due
│  │  ├─ streak.ts           streak + grace
│  │  ├─ capacity.ts         planned deep work, overload, fix suggestion
│  │  ├─ slots.ts            next free focus slot
│  │  └─ text.ts             normalization, bidi isolation, length rules
│  ├─ server/
│  │  ├─ services/           tasks, habits, plans, blocks, checkin, settings (Phase 2 tools wrap these)
│  │  ├─ actions/            thin Server Actions → services
│  │  ├─ validation/         zod schemas shared by actions and (later) tools
│  │  ├─ google/             oauth.ts, tokens.ts, crypto.ts, provider.ts (interface),
│  │  │                      google-provider.ts, fake-provider.ts, sync.ts, mapping.ts
│  │  ├─ push/               web-push sender, nudge rules
│  │  └─ supabase/           server client (user session), admin client (service role, server-only)
│  ├─ components/            Text, UserText (dir=auto), TextField, Button, Sheet, List, Section
│  └─ lib/                   env.ts (zod-validated env), format.ts (Intl dates/durations)
├─ public/sw.js              small hand-written service worker: shell cache + push
└─ tests/
   ├─ unit/                  Vitest (domain + services with fake provider)
   ├─ integration/           sync engine against fake Google + recorded fixtures
   └─ e2e/                   Playwright: phone + desktop viewports, he/ar/en text
```

`prompts/` and `src/assistant/tools/` get added in Phase 2.

---

## 4. Database schema

General rules:
- Every table has `user_id uuid not null default auth.uid() references auth.users on delete cascade`.
- RLS is enabled on every table, with one policy per operation: `user_id = (select auth.uid())`.
- `goals`, `tasks` and `habits` have `unique (id, user_id)`. References between user tables use **composite foreign keys** `(x_id, user_id)`, so a row can never point at another user's data, even through a bug.
- All timestamps are `timestamptz` stored in UTC. "Days" are `date` values in the user's logical day (see 5.1).
- `created_at` / `updated_at` everywhere, with an `updated_at` trigger.
- `auth.users` is the users table. There is no duplicate `users` table.

```
settings                                   one row per user, created by a signup trigger
  user_id              uuid pk
  timezone             text      'Asia/Jerusalem'     validated against IANA list
  day_rollover         time      '04:00'              before this, it is still "yesterday"
  week_start           smallint  0                    0 = Sunday
  wake_time            time      '10:00'
  shutdown_time        time      '22:30'
  focus_windows        jsonb     [{"start":"11:00","end":"15:00"},{"start":"18:00","end":"22:00"}]
  focus_block_min      smallint  45     check 15..180
  break_min            smallint  15     check 0..60
  focus_capacity_min   smallint  360    check 60..720   warn above this
  block_reminders      boolean   true   Google popup at block start
  theme                text      'system'  check in (system, light, dark)

goals                                      the ladder; 3 rows seeded at signup
  id uuid pk, user_id
  rank        smallint  check 1..3,  unique (user_id, rank) deferrable
  title       text 1..80     "University grades" / "AI agency & voice AI" / "Health"
  label       text 1..12     "Grades" / "Agency" / "Health"  (shown as the tag)

tasks
  id uuid pk, user_id
  goal_id       uuid not null   fk (goal_id, user_id) → goals
  title         text 1..300
  notes         text ≤ 5000 null
  est_min       smallint null   check 5..600
  due_on        date null
  planned_for   date null       the day it is planned for
  position      smallint null   order within that day; 1–3 = Today's top 3
  status        text 'open'     check in (open, done, dropped)
  completed_at  timestamptz null
  slip_count    smallint 0      +1 each time check-in moves it to a later day
  index (user_id, status, planned_for)

day_plans
  user_id, day date, pk (user_id, day)
  mit_task_id   uuid null  fk (mit_task_id, user_id) → tasks  on delete set null (mit_task_id)
  mit_set_at    timestamptz     set at night for tomorrow, or in the morning

habits
  id uuid pk, user_id
  goal_id          uuid not null  fk → goals
  name             text 1..80
  minimum_version  text 1..120 NOT NULL      the bad-day fallback is required
  schedule_kind    text check in (daily, days, per_week)
  schedule_days    smallint[] null           for 'days': 0..6
  per_week         smallint null check 1..7  for 'per_week'
  target_time      time null                 nudge + block time
  block_min        smallint null             set = create calendar blocks
  grace_allowed    smallint 1                forgiven misses ...
  grace_window     smallint 7                ... per this many scheduled periods
  position         smallint
  archived_at      timestamptz null          archive instead of delete
  check: schedule fields match schedule_kind

habit_logs
  id uuid pk, user_id
  habit_id   uuid  fk (habit_id, user_id) → habits
  day        date                    logical day
  level      text check in (full, minimum)
  logged_at  timestamptz default now()
  unique (habit_id, day)
  -- a miss is the absence of a log on a scheduled day; it is not stored

reviews
  id uuid pk, user_id
  kind          text check in (daily, weekly)     Phase 1 writes 'daily' only
  period_start  date, period_end date
  note          text ≤ 5000 null
  stats         jsonb   snapshot: tasks done/moved/dropped, focus planned/done min,
                        habits full/minimum/missed
  completed_at  timestamptz
  unique (user_id, kind, period_start)

calendar_blocks                            W.A.R.D.-owned, two-way synced
  id uuid pk                               Google event id = id without hyphens
  user_id
  kind        text check in (focus, habit)
  task_id     uuid null  fk → tasks
  habit_id    uuid null  fk → habits
  goal_id     uuid null  fk → goals        null only for blocks created directly in Google
  title       text 1..200
  starts_at, ends_at  timestamptz          check ends_at > starts_at, ≤ 4 h
  day         date                         logical day of starts_at (capacity queries)
  outcome     text null check in (done, partial, skipped)
  google_calendar_id  text null
  google_etag         text null
  google_updated_at   timestamptz null
  sync_state  text 'pending' check in (synced, pending, error)
  sync_error  text null                    error code only, never content
  deleted_at  timestamptz null             tombstone; also stops a habit block being re-created
  unique (habit_id, day) where kind = 'habit'

calendars                                  Google calendars the user can see
  user_id, google_calendar_id, pk (user_id, google_calendar_id)
  summary         text
  selected        boolean false            show on Today/Week, count as busy
  is_ward         boolean false            the app-created "W.A.R.D." calendar
  last_synced_at  timestamptz, last_error text null

calendar_events                            read-only cache of other calendars
  user_id, google_calendar_id, google_event_id
  pk (user_id, google_calendar_id, google_event_id)
  title       text
  starts_at, ends_at timestamptz null      timed events
  start_date, end_date date null           all-day events
  busy        boolean                      transparency = opaque
  status      text check in (confirmed, tentative)
  html_link   text
  synced_at   timestamptz
  -- no description, location or attendees are stored (data minimization)

google_accounts                            SERVER ONLY: RLS on, no policies → service role only
  user_id pk
  google_sub, email           text
  scopes                      text[]
  refresh_token_enc           text   "v1:<iv>:<ciphertext>:<tag>" AES-256-GCM
  access_token_enc            text null, access_expires_at timestamptz null
  ward_calendar_id            text null
  status                      text check in (active, needs_reconnect)
  connected_at                timestamptz

push_subscriptions                         step 15 only
  id, user_id, endpoint text unique, p256dh text, auth text, created_at, last_used_at
nudges_sent                                prevents duplicate pushes
  user_id, kind text, ref_id uuid, day date, unique (user_id, kind, ref_id, day)
```

**Changes from the starting data model:**
- Added `day_plans` (the one thing per day), `calendars` + `calendar_events` (Google read cache), `google_accounts` (tokens, server-only), and `push_subscriptions` / `nudges_sent`.
- `notes`, `note_links`, `decisions`, `calls` and pgvector wait for their phases. Nothing in this schema blocks them.

---

## 5. Core rules (tests are written against these definitions)

### 5.1 Logical day
`logicalDay(instant, tz, rollover)`: the date in `tz` after subtracting `rollover` (04:00). A habit logged or a shutdown done at 00:40 counts for the previous day. Today, Week, streaks and capacity all use this one function. DST transitions are covered by tests.

### 5.2 Habit streaks with grace
- A **period** is one scheduled day for `daily` and `days` habits, or one week (by `week_start`) for `per_week` habits.
- Outcome per finished period: **hit** (full or minimum log; a per_week habit needs ≥ `per_week` logs) or **miss**. The current period is **pending**: it never counts and never breaks a streak.
- Walk back from the latest finished period. A hit adds 1. A miss is **forgiven** (adds 0, streak continues) only if (a) the next newer period was not a miss and (b) no other forgiven miss falls within the last `grace_window` periods. Any other miss ends the streak. With the defaults, that means one forgiven miss per 7 scheduled days, never two in a row.
- Periods before the habit was created don't exist.
- **Never miss twice:** if the last finished period was a miss and the current one is still open, the habit row shows "Missed yesterday. Never miss twice — the minimum counts." with the minimum button first.
- The habit detail screen always shows honest numbers next to the streak: full / minimum / missed counts for the last 30 days, and which miss used the grace.

### 5.3 Planned deep work and overload
`plannedDeep(day)` = minutes of focus blocks on that day (not deleted, not skipped) **plus** `est_min` of open tasks planned for that day that have no focus block on that day. Habit blocks and outside events don't count.
- **Over capacity** when `plannedDeep > focus_capacity_min`. The warning always proposes a fix: move the lowest-ladder movable item(s) needed to get under capacity to the next day with room, and list exactly what will move. One tap applies it (with the calendar preview if blocks move).
- **No priority-1 work**: a day with a plan but no Grades item gets one plain line: "No Grades work planned."

### 5.4 Next free focus slot
`nextSlot(day, now, windows, busy, blockMin, breakMin)`: the earliest start (rounded up to 5 min, ≥ now) inside a focus window, where `[start, start+blockMin)` overlaps nothing busy and keeps a `breakMin` gap after the previous focus block. Busy = selected-calendar timed events marked busy + all W.A.R.D. blocks. All-day events don't count as busy. The one thing for the day gets the first slot (hardest first).

### 5.5 Multilingual text (Hebrew, Arabic, English)
- Every input and every element that shows user text uses `dir="auto"`. Multi-line text also gets `unicode-bidi: plaintext`, so each paragraph takes its own direction (this handles switching language mid-text).
- Layout uses only logical CSS (`ps/pe`, `ms/me`, `text-start`), so a future RTL UI language needs no layout rewrite.
- Inputs are normalized to NFC. C0 control characters are rejected except newline and tab. Bidi marks (LRM/RLM/ALM) are kept because they are legitimate in Hebrew and Arabic. Length limits count code points.
- Titles sent to Google wrap user text in FSI…PDI (U+2068/U+2069), e.g. `Focus · ⁨סיכום הרצאה 4⁩`, so mixed-direction titles display correctly in Google Calendar.
- Fonts: the system UI stack, which has good Hebrew and Arabic coverage on iOS, Android, macOS and Windows. Nothing to download.
- UI dates and times use `Intl` with `en-GB`-style output in the user's time zone, 24-hour clock ("Tue 6 Oct", "18:00").

---

## 6. Screens (text wireframes)

Bottom nav, text only: **Today · Tasks · Habits · Week**. Settings is linked from the Today header. The check-in opens from Today.
Style: one text size scale, one accent color for the primary action, light and dark themes, no icons or decoration. `[ ]` marks a tap target.

### 6.1 Sign in
```
W.A.R.D.

[ Continue with Google ]

or get a code by email
[ you@example.com          ] [ Send code ]
```

### 6.2 First run (welcome, about 2 minutes, every step skippable)
```
1/4  Your day
     Time zone       Asia/Jerusalem
     Wake 10:00 · Shutdown 22:30 · Day ends at 04:00
     Focus windows   11:00–15:00, 18:00–22:00
     Focus 45m / break 15m · Capacity 6h per day
     [ Looks right ]  [ Edit ]

2/4  Goal ladder
     1 Grades   — University grades
     2 Agency   — AI agency & voice AI
     3 Health   — Gym, food, sleep
     [ Next ]  [ Rename / reorder ]

3/4  Google Calendar
     W.A.R.D. reads your calendars and writes only to its own
     calendar named "W.A.R.D.".
     [ Connect ]  [ Later ]
     → then: Show events from  [x] Primary  [x] University  [ ] Holidays

4/4  First habits (optional)
     [x] Gym           min: 10 push-ups        Health
     [x] Read 20 min   min: 1 page             Grades
     [ ] Lunch by 15:30  min: any real meal    Health
     [ Add selected ]  [ Skip ]
```

### 6.3 Today
```
Tue 6 Oct                                         Settings
NOW  Focus · Algorithms HW 3 · until 11:45 (25m)   [ Done ]
──────────────────────────────────────────────────────────
ONE THING
Algorithms HW 3                              Grades · 90m
set last night                       [ Schedule ] [ Change ]

TOP 3
[ ] Algorithms HW 3                          Grades · 90m
[ ] סיכום הרצאה 4                             Grades · 60m
[ ] Send proposal to clinic                  Agency · 30m
    2 more planned today
[ Add a task…                                          ]

PLAN CHECK                                  (only if needed)
Focus planned 6h 45m of 6h. Over by 45m.
Move "Send proposal to clinic" (30m) and one 45m block
to Wed (2h planned)?                         [ Move ] [ Keep ]

CALENDAR                                  synced 1 min ago
11:00–11:45  Focus · Algorithms HW 3            W.A.R.D.
12:00–12:45  Focus · Algorithms HW 3            W.A.R.D.
13:00–14:30  Data Structures lecture            University
16:00–17:00  Gym                                W.A.R.D.
18:00–18:45  Focus · Linear algebra             W.A.R.D.
[ + Focus block ]

HABITS                                             2 of 4
✓ Lunch by 15:30                                 minimum
✓ Read 20 min                                       full
[ ] Gym                         [ Done ] [ Min: 10 push-ups ]
[ ] Walk 20 min                 [ Done ] [ Min: 5 min ]
    Missed yesterday. Never miss twice — the minimum counts.

[ Start shutdown ]                        (after 22:30)
──────────────────────────────────────────────────────────
Today          Tasks          Habits          Week
```
- If the one thing isn't set, the section reads "Pick the one thing" and lists the top 3 as choices (one tap).
- Logging a habit or checking off a task updates the screen immediately (optimistic update) and saves in the background. Tapping again undoes it.
- If Google needs reconnecting, a one-line banner appears: "Google Calendar disconnected. [Reconnect]".

### 6.4 Focus block sheet (preview before any calendar write)
```
Focus for: Algorithms HW 3
Suggested  Today 11:00 (first free slot, 11:00–15:00 window)
[ Earlier ] [ Later ] [ Pick time ]      Blocks [1] [2] [3]

Adds to Google Calendar "W.A.R.D.":
  11:00–11:45  Focus · Algorithms HW 3
  12:00–12:45  Focus · Algorithms HW 3
Today after this: 5h 15m of 6h

[ Add 2 blocks ]  [ Cancel ]
```
Moving or deleting a block uses the same sheet: old → new, or "Removes … from Google Calendar".

### 6.5 Tasks
```
Tasks                               [Open] [Done] [Dropped]
[ Add a task…                                          ]
  Goal  [Grades] [Agency] [Health]      last used is preselected
  Time  [15m] [30m] [45m] [90m] [—]
  When  [Today] [Tomorrow] [Pick day] [Later]
  Enter saves with the highlighted choices.

GRADES
[ ] Algorithms HW 3                     90m · Today · due Thu
[ ] סיכום הרצאה 4                        60m · Today
[ ] Linear algebra ex. 5                45m · Wed · slipped 2×
AGENCY
[ ] Send proposal to clinic             30m · Today
[ ] تحديث عرض الأسعار للعميل             20m · Later
HEALTH
[ ] Meal prep for the week              60m · Fri
```
Tapping a task opens the edit sheet: title, goal, estimate, planned day, due date, notes, `[Done] [Drop] [Focus block]`. Drop sets the status (reversible). Nothing gets hard-deleted from the UI in Phase 1.

### 6.6 Habits and habit detail
```
Habits                                            [ + New ]
Gym              Health · streak 6 · 30d 88%
  min: 10 push-ups · Sun Mon Tue Thu · 16:00 · 60m block
Read 20 min      Grades · streak 0 · 30d 61%
  min: 1 page · daily
```
```
Gym · Health
Streak 6 · grace used Thu 1 Oct (1 per 7 days, never twice in a row)
Last 30 days: 12 full · 3 minimum · 2 missed · of 17 scheduled

          S  M  T  W  T  F  S
Sep 27    ✓  ✓  ·  ·  m  ·  ·
Oct 4     ✓  x  ○
✓ full   m minimum   x missed   · not scheduled   ○ today

[ Edit ]  [ Archive ]
```
```
Edit habit
Name             [ Gym                         ]
Goal             [Grades] [Agency] [Health]
Minimum version  [ 10 push-ups at home         ]  required
Schedule         [Daily] [Days] [N per week]    S M T W T F S
Time             [ 16:00 ]  optional
Calendar block   [Off] [30m] [60m] [90m]
Grace            1 miss per 7 days, never two in a row   [Strict]
[ Save ]
→ with a block: "Adds 'Gym' 16:00–17:00 to your W.A.R.D. calendar on
   Sun Mon Tue Thu, 7 days ahead, rolling. [Confirm] [Cancel]"
```

### 6.7 Week
```
Week · Sun 4 – Sat 10 Oct                  capacity 6h/day
Sun 4    5h 10m
Mon 5    6h 40m   over by 40m                     [ Fix ]
Tue 6    4h 30m   today
Wed 7    2h 00m
Thu 8    0h 45m   no Grades work
Fri 9    —
Sat 10   —
[ ← ]  [ → ]
```
Tapping a day shows its blocks, events and planned tasks, with move actions (same preview sheet).

### 6.8 Night check-in (Shutdown)
```
Shutdown · Tue 6 Oct                                ~1 min
1  TODAY
   ✓ Algorithms HW 3
   ✓ Send proposal to clinic
   [ ] סיכום הרצאה 4      [Done] [Tomorrow] [Pick day] [Drop]
       Slipped 3×. Make it smaller or drop it?   [Edit] [Drop]
   Focus blocks: 5 on calendar                [ All done ]
     11:00 ✓   12:00 ✓   13:00 skipped   18:00 ✓   19:00 ✓
     (tap a block to cycle done / partial / skipped)

2  HABITS NOT LOGGED          (left untouched = missed)
   Walk 20 min                       [ Done ] [ Min ]

3  TOMORROW'S FIRST TASK
   (•) סיכום הרצאה 4                       Grades · 60m
   ( ) Linear algebra ex. 5               Grades · 45m
   [ + New ]
   Tomorrow: 4h 30m focus planned of 6h

4  NOTE (optional)
   [                                                   ]

[ Close the day ]
```
Closing writes `reviews(daily)` (with a stats snapshot), sets `day_plans(tomorrow).mit_task_id`, moves the slipped tasks and increments their `slip_count`.

### 6.9 Settings
```
SCHEDULE      Time zone · wake · shutdown · day ends at · focus windows
              Focus/break length · daily capacity
GOAL LADDER   names and order
GOOGLE        Connected as …@gmail.com · last sync 2 min ago [Sync now]
              Show events from: [x] Primary [x] University [ ] Holidays
              Popup at block start [on]
              [ Disconnect ] → confirm; option to also remove the "W.A.R.D." calendar
NOTIFICATIONS [ Enable on this device ] · habit nudges [on] · shutdown [on]
APPEARANCE    [System] [Light] [Dark]
ACCOUNT       Sign out
```

---

## 7. Google Calendar sync

**Ownership**
- **Other calendars** (Primary, University, …): Google is the source of truth. W.A.R.D. reads them into the `calendar_events` cache and never writes to them. The scopes make this a hard limit, not just a code convention.
- **The "W.A.R.D." calendar**: both sides can edit. The database owns the links (task, habit, goal, outcome). Time and title follow whichever side changed them last.

**Connect**
1. Settings → Connect → `/api/google/connect` builds the auth URL (PKCE + `state` in an httpOnly cookie, `access_type=offline`, `prompt=consent`, the three scopes).
2. On callback: check `state`, exchange the code, encrypt and store the refresh token, read the calendar list into `calendars`, create the "W.A.R.D." calendar (or find it if it exists) and store its id.
3. Disconnect: revoke the token at Google, delete the stored tokens, and keep local blocks. Ask before removing the W.A.R.D. calendar from Google (default: keep it).

**Write path (W.A.R.D. → Google)**: every block change goes into the DB first with `sync_state = pending`, and then gets pushed immediately in the same Server Action.
- Create: `events.insert` with `id = uuid without hyphens`, `extendedProperties.private.ward_block_id`, the user's time zone, and a popup reminder at 0 min if enabled. A `409` on retry means it already exists, which counts as success.
- Move/edit: `events.patch` with `If-Match: <etag>`. A `412` means it changed in Google: fetch the event, apply the conflict rule below, and show the result.
- Delete: `events.delete`. A `404` or `410` counts as success. The row keeps a `deleted_at` tombstone. IDs are never reused.
- On failure (network error, rate limit), the block stays `pending`, the UI shows "not synced yet", and the next sync retries with backoff.

**Read path (Google → W.A.R.D.)**, `syncUser()`:
1. Refresh the access token if needed. If Google returns `invalid_grant`, set the account to `needs_reconnect` and show the banner.
2. Push pending blocks.
3. For each selected calendar: `events.list(timeMin = today−7d, timeMax = today+35d, singleEvents = true)` with paging. Replace that window in `calendar_events` in one transaction (upsert what came back, delete what didn't).
4. For the W.A.R.D. calendar: the same list with `showDeleted = true`, then reconcile with `calendar_blocks`:
   - event newer than `google_updated_at` and the block has no pending change → take the new time/title (you moved it in Google)
   - event `cancelled` → tombstone the block (you deleted it in Google)
   - event not linked to any block (you created it in that calendar) → import it as an untagged focus block; Today asks for a goal
   - block in the window but missing from the list → `events.get` to confirm before doing anything (it may have been moved out of the window)
5. Create habit blocks for the next 7 days where they're missing and no tombstone exists.

**Conflict rule** (both sides changed since the last sync, which needs two devices editing within minutes): the newer change wins (local `updated_at` vs Google `updated`). If the times are equal, Google wins. The run's conflict counter goes up and nothing is lost silently.

**When sync runs**: when the app opens or regains focus (if the last sync was > 60 s ago), on "Sync now", after each write, and from `pg_cron` every 15 min (inside the 5-min tick), so nudges see current data.

**Volume**: about 4 calendars × (96 cron runs + app opens) per day, which is fewer than 1,000 calls/day. That is far below Google's quotas.

**Testing**: everything goes through a `CalendarProvider` interface. `FakeCalendarProvider` (in memory) runs unit, integration and E2E tests, including the 409/410/412/`invalid_grant`, moved-in-Google, deleted-in-Google and conflict cases. The real provider is checked by hand against your account with a written checklist.

---

## 8. Security

- RLS on every table, plus composite FKs against cross-user references. pgTAP tests check that user A can't read or write any of user B's rows in any table, and that `google_accounts` is unreachable with a user session.
- The service role key is used only in `server-only` modules (sync, tokens, cron). It is never imported by client code (enforced by the `server-only` package).
- OAuth: PKCE + state, exact redirect URIs, least-privilege scopes, tokens encrypted with AES-256-GCM (versioned format so the key can be rotated), and no token or event content in logs (log IDs and error codes only).
- Every Server Action and route validates input with zod (lengths, enums, dates, time zone). Text normalization follows 5.5.
- The cron route needs `Authorization: Bearer CRON_SECRET`, checked with a constant-time comparison.
- Headers: a CSP with nonces, `frame-ancestors 'none'`, `Referrer-Policy: same-origin`, `Permissions-Policy`, and HSTS (from Vercel).
- Sign-in allowlist (`ALLOWED_EMAILS`) is checked in the auth callback and in middleware. Public signups are turned off in Supabase after your account exists.
- **No unconfirmed outward-facing or destructive action**: every Google Calendar write goes through the preview sheet. Enabling a habit block confirms the rolling schedule once. Disconnect asks for confirmation. Tasks and habits are dropped or archived, never hard-deleted.

---

## 9. Test approach

| Layer | Tool | What is covered |
|---|---|---|
| Domain | Vitest | Logical day (rollover, DST), schedules, streak and grace (every rule in 5.2 has a named test), capacity and fix suggestion, next slot, text normalization and bidi wrapping. Target: 100% branch coverage of `src/domain`. |
| Services + sync | Vitest + fake provider + recorded Google fixtures | Create/move/delete round trips, idempotent insert, 409/410/412, `invalid_grant`, imported events, tombstones, conflicts, pending retries. |
| Database | pgTAP via `supabase test db` | RLS isolation for all tables, composite FKs, check constraints, signup trigger. |
| End to end | Playwright (Chromium; 390×844 and 1280×800) | The main flow from section 1. Hebrew, Arabic and mixed titles keep their direction in lists, inputs and the check-in. Dark and light mode. Keyboard-only use of the check-in. |
| Manual | Checklist in README | Real Google account: connect, add block, move it in Google → reflected, delete in Google → reflected, disconnect revokes. Installed PWA on a real phone. |

CI (GitHub Actions): lint, typecheck, unit tests, then `supabase start` → db tests → E2E on every push.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Google OAuth apps in **Testing** status get refresh tokens that expire after 7 days | Set the consent screen to **In production** while unverified. You click through Google's "unverified app" warning once. That is fine for a personal app (cap of 100 users). If W.A.R.D. ever has other users, Google verification is required first. |
| iOS standalone PWA: OAuth redirects and storage are isolated from Safari. Web Push only works after "Add to Home Screen" (iOS 16.4+), and iOS notifications have no action buttons. | Email-code login as fallback. On iOS a nudge opens a one-tap log screen. Test on a real device at milestones 2 and 4. |
| Focus blocks in a secondary calendar don't show as busy in your primary calendar's free/busy view | Booking tools such as Calendly and Google appointment schedules can check extra calendars. Add the W.A.R.D. calendar there. |
| Supabase free projects pause after about a week of no activity | Daily use avoids it. Supabase Pro removes the limit if needed. |
| Late nights past midnight split the day in the wrong place | Rollover setting (04:00) used everywhere through one function. |
| Two-way sync edge cases | Small surface (one calendar W.A.R.D. owns, single events only), idempotent ids, ETags, tombstones, and fake-provider tests for each case. |
| Scope creep | Anything outside Phase 1 goes into `BACKLOG.md`. |

---

## 11. Build steps

Each step is one reviewable commit (sometimes two), and the app runs after every step. After each step I report what changed, how to test it, and what's next. Estimates are focused build hours.

**Milestone 1 — Foundation (~17 h)**
1. **Scaffold & tooling** — Next.js + TS strict + Tailwind, ESLint/Prettier, Vitest, Playwright, CI workflow, `env.ts` (zod), `.env.example`, README skeleton. *2 h*
2. **Schema v1** — migrations for all Phase 1 tables except push, RLS policies, composite FKs, signup trigger (settings + 3 goals), generated TS types, pgTAP RLS tests. *4 h*
3. **Auth** — Google sign-in + email-code fallback, allowlist, session middleware, protected `(app)` group, sign out. *3 h*
4. **Shell & look** — layout, text-only bottom nav, type scale, light/dark tokens with one accent, `UserText`/`TextField` with `dir="auto"`, PWA manifest + minimal service worker (installable). *3 h*
5. **Domain logic, test-first** — `day`, `schedule`, `streak`, `capacity`, `slots`, `text`. *5 h*

**Milestone 2 — Daily loop without Google (~16 h)**: usable every day from here.
6. **Tasks** — services, actions, Tasks screen, quick add, edit sheet, goal tag required, planned day, top-3 order, drop/restore. *4 h*
7. **Habits** — create/edit with required minimum version, schedules, grace; one-tap full/minimum logging with undo; detail screen with honest stats. *4 h*
8. **Today** — logical day, one thing (pick/change), top 3, habits with the never-miss-twice prompt, plan check from task estimates. *4 h*
9. **Night check-in** — today's tasks (done/move/drop, slip count), unlogged habits, tomorrow's first task + tomorrow's load, note; writes `reviews` + `day_plans`. *4 h*

**Milestone 3 — Google Calendar (~18 h)**
10. **Connect Google** — OAuth (PKCE/state), encrypted tokens, refresh, `needs_reconnect` banner, create/find the W.A.R.D. calendar, calendar picker, disconnect + revoke. *4 h*
11. **Read sync** — provider interface + fake, windowed pull into `calendar_events`, sync on open / manual / `pg_cron` tick, Calendar section on Today, busy time into `nextSlot`. *5 h*
12. **Block write sync** — focus block sheet with preview, habit blocks (rolling 7 days), move/delete, reconcile Google-side edits, conflict rule, retries; focus-block outcomes in the check-in; blocks count in the plan check. *6 h*
13. **Week** — 7-day capacity list, overload warning + one-tap fix with preview, "no Grades work" flag, day detail. *3 h*

**Milestone 4 — Finish (~12 h)**
14. **Settings & first run** — all settings from 6.9, the 4-step welcome flow. *3 h*
15. **Web Push nudges** (can be cut) — device subscription, habit nudge at `target_time` if not logged (never-miss-twice wording after a miss), shutdown reminder, at most 4 pushes a day, none during a focus block (sent at the next break), deduplicated through `nudges_sent`. *5 h*
16. **Hardening & definition of done** — full E2E on phone and desktop sizes, he/ar/en text tests, security headers and pass, README (setup, env vars, run, test, manual Google checklist), real-phone run-through. *4 h*

**Total: about 63 focused hours.** The app is usable daily after Milestone 2 (~33 h).

**Your time:** create the Supabase project + Vercel project before step 2 (~20 min, I'll give exact steps). Create the Google Cloud project + OAuth client before step 10 (~20 min). Review at each milestone. Test on your phone after Milestones 2 and 4.

**Environment variables** (`.env.example`):
```
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY                  server only
ALLOWED_EMAILS                       comma-separated
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET                 server only
TOKEN_ENCRYPTION_KEY                 32 bytes, base64; server only
CRON_SECRET                          server only
CALENDAR_PROVIDER                    google | fake
NEXT_PUBLIC_VAPID_PUBLIC_KEY         step 15
VAPID_PRIVATE_KEY                    step 15, server only
VAPID_SUBJECT                        step 15
```

---

## 12. Open questions

1. **Single user?** I plan to lock sign-in to your email and keep the Google app unverified. If W.A.R.D. might get other users in the next ~6 months, tell me. That adds Google verification and changes the first-run flow.
2. **Existing Google events read-only?** In Phase 1, W.A.R.D. shows lectures and meetings but doesn't edit them, and writes only to its own "W.A.R.D." calendar. OK?
3. **Web Push in Phase 1?** Step 15 includes it as the last step, which can be cut. Without it, nudges in Phase 1 are Google Calendar popups at block start plus prompts inside the app.
4. **Defaults correct?** Asia/Jerusalem, day ends at 04:00, week starts Sunday, warning above 6 h/day, focus windows 11–15 and 18–22, shutdown 22:30.
5. **Two rules to confirm:** (a) grace = one forgiven miss per 7 scheduled days, never two in a row; the minimum version counts as a hit; the streak counts hits only. (b) Planned deep work = focus blocks + estimates of planned tasks that have no block yet.
