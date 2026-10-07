import "server-only";
import { dayBounds, type IsoDate } from "@/domain/day";
import { check, type Ctx } from "@/server/context";
import { getConnection, type GoogleConnection } from "@/server/google/accounts";
import { createAdminClient } from "@/server/supabase/admin";

export type CalendarStatus = {
  connection: GoogleConnection | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  calendars: {
    id: string;
    summary: string;
    selected: boolean;
    isWard: boolean;
    lastError: string | null;
  }[];
};

export async function calendarStatus(ctx: Ctx): Promise<CalendarStatus> {
  const admin = createAdminClient();
  const [connection, account, calendars] = await Promise.all([
    getConnection(admin, ctx.userId),
    admin
      .from("google_accounts")
      .select("last_synced_at, last_sync_error")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    ctx.db
      .from("calendars")
      .select("google_calendar_id, summary, selected, is_ward, last_error")
      .order("summary"),
  ]);
  return {
    connection,
    lastSyncedAt: account.data?.last_synced_at ?? null,
    lastError: account.data?.last_sync_error ?? null,
    calendars: (check(calendars, "load your calendars") ?? []).map((c) => ({
      id: c.google_calendar_id,
      summary: c.summary,
      selected: c.selected,
      isWard: c.is_ward,
      lastError: c.last_error,
    })),
  };
}

export type AgendaItem = {
  kind: "event" | "focus" | "habit";
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  /** Calendar name for outside events; "W.A.R.D." for blocks. */
  source: string;
  busy: boolean;
  taskId?: string | null;
  goalLabel?: string | null;
  syncState?: string;
  outcome?: string | null;
  link?: string | null;
};

/** Everything on a logical day: outside events (selected calendars) and W.A.R.D. blocks. */
export async function dayAgenda(ctx: Ctx, day: IsoDate): Promise<AgendaItem[]> {
  const { start, end } = dayBounds(day, ctx.settings.timezone, ctx.settings.day_rollover);
  const [timed, allDay, blocks, calendars] = await Promise.all([
    ctx.db
      .from("calendar_events")
      .select("google_calendar_id, google_event_id, title, starts_at, ends_at, busy, html_link")
      .eq("all_day", false)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
    ctx.db
      .from("calendar_events")
      .select("google_calendar_id, google_event_id, title, start_date, end_date, html_link")
      .eq("all_day", true)
      .lte("start_date", day)
      .gt("end_date", day),
    ctx.db
      .from("calendar_blocks")
      .select(
        "id, kind, title, starts_at, ends_at, task_id, sync_state, outcome, goal:goals!calendar_blocks_goal_fk(label)",
      )
      .eq("day", day)
      .is("deleted_at", null),
    ctx.db.from("calendars").select("google_calendar_id, summary, selected"),
  ]);
  const cals = new Map(
    (check(calendars, "load calendars") ?? []).map((c) => [c.google_calendar_id, c]),
  );
  const shown = (id: string) => cals.get(id)?.selected ?? false;

  const items: AgendaItem[] = [
    ...(check(allDay, "load events") ?? [])
      .filter((e) => shown(e.google_calendar_id))
      .map((e) => ({
        kind: "event" as const,
        id: e.google_event_id,
        title: e.title,
        start: null,
        end: null,
        allDay: true,
        source: cals.get(e.google_calendar_id)?.summary ?? "",
        busy: false,
        link: e.html_link,
      })),
    ...(check(timed, "load events") ?? [])
      .filter((e) => shown(e.google_calendar_id))
      .map((e) => ({
        kind: "event" as const,
        id: e.google_event_id,
        title: e.title,
        start: new Date(e.starts_at!),
        end: new Date(e.ends_at!),
        allDay: false,
        source: cals.get(e.google_calendar_id)?.summary ?? "",
        busy: e.busy,
        link: e.html_link,
      })),
    ...(check(blocks, "load blocks") ?? []).map((b) => ({
      kind: b.kind as "focus" | "habit",
      id: b.id,
      title: b.title,
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
      allDay: false,
      source: "W.A.R.D.",
      busy: true,
      taskId: b.task_id,
      goalLabel: (b.goal as unknown as { label: string } | null)?.label ?? null,
      syncState: b.sync_state,
      outcome: b.outcome,
    })),
  ];
  return items.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0);
  });
}
