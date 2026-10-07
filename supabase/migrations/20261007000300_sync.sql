-- Calendar sync support: sync status on the account, an atomic window
-- replacement for the event cache, and the 5-minute scheduler tick.

alter table public.google_accounts
  add column last_synced_at timestamptz,
  add column last_sync_error text check (char_length(last_sync_error) <= 200);

-- Replaces one calendar's cached events inside a time window in a single
-- transaction: everything overlapping the window is removed, then the events
-- Google returned are inserted. Service role only.
create function public.replace_calendar_window(
  p_user uuid,
  p_calendar text,
  p_from timestamptz,
  p_to timestamptz,
  p_from_date date,
  p_to_date date,
  p_events jsonb
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
begin
  delete from public.calendar_events
  where user_id = p_user
    and google_calendar_id = p_calendar
    and (
      (not all_day and starts_at < p_to and ends_at > p_from)
      or (all_day and start_date < p_to_date and end_date > p_from_date)
    );

  insert into public.calendar_events (
    user_id, google_calendar_id, google_event_id, title, starts_at, ends_at,
    start_date, end_date, all_day, busy, status, html_link, synced_at
  )
  select
    p_user, p_calendar, e ->> 'id', e ->> 'title',
    (e ->> 'starts_at')::timestamptz, (e ->> 'ends_at')::timestamptz,
    (e ->> 'start_date')::date, (e ->> 'end_date')::date,
    (e ->> 'all_day')::boolean, (e ->> 'busy')::boolean, e ->> 'status', e ->> 'html_link', now()
  from jsonb_array_elements(p_events) as e
  on conflict (user_id, google_calendar_id, google_event_id) do update set
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    all_day = excluded.all_day,
    busy = excluded.busy,
    status = excluded.status,
    html_link = excluded.html_link,
    synced_at = excluded.synced_at;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.replace_calendar_window(uuid, text, timestamptz, timestamptz, date, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_calendar_window(uuid, text, timestamptz, timestamptz, date, date, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler: every 5 minutes, POST /api/cron/tick on the app.
-- Configure once per environment (values live in Supabase Vault, not in git):
--   select vault.create_secret('https://your-app.example', 'ward_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'ward_cron_secret');
-- Without those secrets the job does nothing.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function private.cron_tick() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'ward_app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'ward_cron_secret';
  if app_url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(app_url, '/') || '/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

revoke execute on function private.cron_tick() from public, authenticated;

select cron.schedule('ward-tick', '*/5 * * * *', 'select private.cron_tick()');
