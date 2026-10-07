-- W.A.R.D. Phase 1: Google Calendar tables.
-- Ownership: blocks in the app-created "W.A.R.D." calendar are two-way synced
-- (calendar_blocks). Events in all other calendars are a read-only cache
-- (calendar_events) written only by the server sync job.

-- ---------------------------------------------------------------------------
-- google_accounts: SERVER ONLY. RLS on with no policies, so only the service
-- role can read or write. Tokens are encrypted by the app (AES-256-GCM).
-- ---------------------------------------------------------------------------

create table public.google_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_sub text not null,
  email text not null,
  scopes text[] not null default '{}',
  refresh_token_enc text not null,
  access_token_enc text,
  access_expires_at timestamptz,
  ward_calendar_id text,
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_accounts enable row level security;
revoke all on public.google_accounts from anon, authenticated;

create trigger google_accounts_updated_at before update on public.google_accounts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- calendars: Google calendars the user can see; the user picks which to show.
-- ---------------------------------------------------------------------------

create table public.calendars (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  google_calendar_id text not null check (char_length(google_calendar_id) <= 300),
  summary text not null default '' check (char_length(summary) <= 300),
  selected boolean not null default false,
  is_ward boolean not null default false,
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, google_calendar_id)
);

create trigger calendars_updated_at before update on public.calendars
  for each row execute function private.set_updated_at();

alter table public.calendars enable row level security;

create policy "calendars: read own" on public.calendars
  for select to authenticated using (user_id = (select auth.uid()));
create policy "calendars: update own" on public.calendars
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Users may only toggle which calendars are shown.
revoke all on public.calendars from anon, authenticated;
grant select on public.calendars to authenticated;
grant update (selected) on public.calendars to authenticated;

-- ---------------------------------------------------------------------------
-- calendar_events: read-only cache of events from selected calendars.
-- No description, location or attendees are stored.
-- ---------------------------------------------------------------------------

create table public.calendar_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  google_calendar_id text not null,
  google_event_id text not null check (char_length(google_event_id) <= 1024),
  title text not null default '' check (char_length(title) <= 1024),
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  all_day boolean not null,
  busy boolean not null default true,
  status text not null check (status in ('confirmed', 'tentative')),
  html_link text check (char_length(html_link) <= 2048),
  synced_at timestamptz not null default now(),
  primary key (user_id, google_calendar_id, google_event_id),
  constraint calendar_events_calendar_fk foreign key (user_id, google_calendar_id)
    references public.calendars (user_id, google_calendar_id) on delete cascade,
  constraint calendar_events_time_check check (
    (all_day and start_date is not null and end_date is not null)
    or (not all_day and starts_at is not null and ends_at is not null and ends_at >= starts_at)
  )
);

create index calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);
create index calendar_events_user_date_idx on public.calendar_events (user_id, start_date);

alter table public.calendar_events enable row level security;

create policy "calendar_events: read own" on public.calendar_events
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_events to authenticated;

-- ---------------------------------------------------------------------------
-- calendar_blocks: W.A.R.D.-owned focus and habit blocks, two-way synced.
-- The Google event id is the block id without hyphens (idempotent inserts).
-- ---------------------------------------------------------------------------

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('focus', 'habit')),
  task_id uuid,
  habit_id uuid,
  goal_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Logical day of starts_at in the user's time zone (capacity queries).
  day date not null,
  outcome text check (outcome in ('done', 'partial', 'skipped')),
  google_calendar_id text,
  google_etag text,
  google_updated_at timestamptz,
  sync_state text not null default 'pending' check (sync_state in ('synced', 'pending', 'error')),
  sync_error text check (char_length(sync_error) <= 200),
  -- Tombstone: kept so a deleted habit block is not re-created.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_blocks_time_check check (
    ends_at > starts_at and ends_at - starts_at <= interval '4 hours'
  ),
  constraint calendar_blocks_habit_check check (kind <> 'habit' or habit_id is not null),
  constraint calendar_blocks_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id),
  constraint calendar_blocks_habit_fk foreign key (habit_id, user_id)
    references public.habits (id, user_id) on delete cascade,
  constraint calendar_blocks_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete restrict
);

create unique index calendar_blocks_habit_day_key
  on public.calendar_blocks (habit_id, day) where kind = 'habit';
create index calendar_blocks_user_day_idx
  on public.calendar_blocks (user_id, day) where deleted_at is null;
create index calendar_blocks_unsynced_idx
  on public.calendar_blocks (user_id) where sync_state <> 'synced';
create index calendar_blocks_task_idx on public.calendar_blocks (task_id);

create trigger calendar_blocks_updated_at before update on public.calendar_blocks
  for each row execute function private.set_updated_at();

alter table public.calendar_blocks enable row level security;

create policy "calendar_blocks: own rows" on public.calendar_blocks
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.calendar_blocks from anon;
