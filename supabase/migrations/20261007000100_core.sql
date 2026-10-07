-- W.A.R.D. Phase 1: core tables.
-- Every table is user-scoped and protected by row-level security.
-- References between user tables use composite foreign keys (x_id, user_id),
-- so a row can never point at another user's data.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- The anon role has no business with any W.A.R.D. table.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when `tz` is an IANA time zone name Postgres knows.
create function private.is_valid_timezone(tz text) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

revoke execute on all functions in schema private from public;
grant execute on function private.is_valid_timezone(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- settings: one row per user
-- ---------------------------------------------------------------------------

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Jerusalem'
    check (char_length(timezone) <= 64 and private.is_valid_timezone(timezone)),
  day_rollover time not null default '04:00' check (day_rollover <= '12:00'),
  week_start smallint not null default 0 check (week_start between 0 and 6),
  wake_time time not null default '10:00',
  shutdown_time time not null default '22:30',
  focus_windows jsonb not null
    default '[{"start":"11:00","end":"15:00"},{"start":"18:00","end":"22:00"}]'
    check (jsonb_typeof(focus_windows) = 'array' and jsonb_array_length(focus_windows) <= 6),
  focus_block_min smallint not null default 45 check (focus_block_min between 15 and 180),
  break_min smallint not null default 15 check (break_min between 0 and 60),
  focus_capacity_min smallint not null default 360 check (focus_capacity_min between 60 and 720),
  block_reminders boolean not null default true,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- goals: the three-level ladder, seeded at signup
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rank smallint not null check (rank between 1 and 3),
  title text not null check (char_length(title) between 1 and 80),
  label text not null check (char_length(label) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_id_user_key unique (id, user_id),
  constraint goals_rank_key unique (user_id, rank) deferrable initially immediate
);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  notes text check (char_length(notes) <= 5000),
  est_min smallint check (est_min between 5 and 600),
  due_on date,
  planned_for date,
  position smallint check (position between 1 and 10000),
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  completed_at timestamptz,
  slip_count smallint not null default 0 check (slip_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_id_user_key unique (id, user_id),
  constraint tasks_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete restrict,
  constraint tasks_completed_check check ((status = 'done') = (completed_at is not null))
);

create index tasks_user_status_planned_idx on public.tasks (user_id, status, planned_for);
create index tasks_goal_idx on public.tasks (goal_id);

-- ---------------------------------------------------------------------------
-- day_plans: the one thing per day
-- ---------------------------------------------------------------------------

create table public.day_plans (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  mit_task_id uuid,
  mit_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint day_plans_mit_fk foreign key (mit_task_id, user_id)
    references public.tasks (id, user_id) on delete set null (mit_task_id)
);

create index day_plans_mit_idx on public.day_plans (mit_task_id);

-- ---------------------------------------------------------------------------
-- habits and habit_logs
-- ---------------------------------------------------------------------------

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  -- The bad-day fallback is required: a minimum version still counts.
  minimum_version text not null check (char_length(minimum_version) between 1 and 120),
  schedule_kind text not null check (schedule_kind in ('daily', 'days', 'per_week')),
  schedule_days smallint[],
  per_week smallint check (per_week between 1 and 7),
  target_time time,
  block_min smallint check (block_min between 5 and 240),
  grace_allowed smallint not null default 1 check (grace_allowed between 0 and 3),
  grace_window smallint not null default 7 check (grace_window between 2 and 30),
  -- First logical day the habit is scheduled. Periods before it don't exist.
  starts_on date not null default current_date,
  position smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habits_id_user_key unique (id, user_id),
  constraint habits_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete restrict,
  constraint habits_schedule_check check (
    (schedule_kind = 'daily' and schedule_days is null and per_week is null)
    or (
      schedule_kind = 'days'
      and per_week is null
      and schedule_days is not null
      and cardinality(schedule_days) between 1 and 7
      and schedule_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
    or (schedule_kind = 'per_week' and schedule_days is null and per_week is not null)
  ),
  constraint habits_block_needs_time check (block_min is null or target_time is not null)
);

create index habits_user_idx on public.habits (user_id) where archived_at is null;
create index habits_goal_idx on public.habits (goal_id);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  day date not null,
  level text not null check (level in ('full', 'minimum')),
  logged_at timestamptz not null default now(),
  constraint habit_logs_habit_day_key unique (habit_id, day),
  constraint habit_logs_habit_fk foreign key (habit_id, user_id)
    references public.habits (id, user_id) on delete cascade
);

create index habit_logs_user_day_idx on public.habit_logs (user_id, day);

-- ---------------------------------------------------------------------------
-- reviews: daily check-ins (Phase 1) and weekly reviews (Phase 2)
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,
  note text check (char_length(note) <= 5000),
  stats jsonb not null default '{}' check (jsonb_typeof(stats) = 'object'),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_period_key unique (user_id, kind, period_start),
  constraint reviews_period_check check (period_end >= period_start)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger settings_updated_at before update on public.settings
  for each row execute function private.set_updated_at();
create trigger goals_updated_at before update on public.goals
  for each row execute function private.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();
create trigger day_plans_updated_at before update on public.day_plans
  for each row execute function private.set_updated_at();
create trigger habits_updated_at before update on public.habits
  for each row execute function private.set_updated_at();
create trigger reviews_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signup: create settings and the three-goal ladder
-- ---------------------------------------------------------------------------

create function private.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id);
  insert into public.goals (user_id, rank, title, label) values
    (new.id, 1, 'University grades', 'Grades'),
    (new.id, 2, 'AI agency & voice AI', 'Agency'),
    (new.id, 3, 'Health: gym, food, sleep', 'Health');
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.settings enable row level security;
alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.day_plans enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.reviews enable row level security;

-- settings and goals are created by the signup trigger: users read and update only.
create policy "settings: read own" on public.settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: update own" on public.settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "goals: read own" on public.goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "goals: update own" on public.goals
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "tasks: own rows" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "day_plans: own rows" on public.day_plans
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "habits: own rows" on public.habits
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "habit_logs: own rows" on public.habit_logs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "reviews: own rows" on public.reviews
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.settings, public.goals, public.tasks, public.day_plans,
  public.habits, public.habit_logs, public.reviews from anon;
