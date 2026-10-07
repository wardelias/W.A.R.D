-- Two-way sync bookkeeping for W.A.R.D. blocks.

-- When the block's time/title/existence last changed in W.A.R.D. (set
-- explicitly by the app, unlike updated_at which sync bookkeeping also bumps).
-- Used to decide "newest change wins" when both sides changed.
alter table public.calendar_blocks
  add column changed_at timestamptz not null default now(),
  add column google_event_id text check (char_length(google_event_id) <= 1024);

-- Blocks created by W.A.R.D. use the block id (no hyphens) as event id;
-- events created directly in the W.A.R.D. calendar keep Google's id.
update public.calendar_blocks
  set google_event_id = replace(id::text, '-', '')
  where google_event_id is null;

create unique index calendar_blocks_event_key
  on public.calendar_blocks (user_id, google_event_id);

-- One block per habit per day, including tombstones (a deleted habit block
-- is not re-created). Focus blocks have no habit, and NULLs never conflict,
-- so a plain unique index works and supports ON CONFLICT.
drop index public.calendar_blocks_habit_day_key;
create unique index calendar_blocks_habit_day_key on public.calendar_blocks (habit_id, day);
