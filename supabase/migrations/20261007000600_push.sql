-- Web Push: device subscriptions, a log of sent nudges (dedupe + daily cap),
-- and per-user switches.

alter table public.settings
  add column nudge_habits boolean not null default true,
  add column nudge_shutdown boolean not null default true;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 2048 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 256),
  auth text not null check (char_length(auth) <= 128),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: own rows" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;

-- Written only by the server's scheduled job.
create table public.nudges_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  key text not null check (char_length(key) <= 100),
  sent_at timestamptz not null default now(),
  primary key (user_id, day, key)
);

alter table public.nudges_sent enable row level security;
revoke all on public.nudges_sent from anon, authenticated;
