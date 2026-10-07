import "server-only";
import webpush from "web-push";
import { addDays, compareDates, logicalDay, type IsoDate } from "@/domain/day";
import { computeStreak, isScheduledOn, type LogLevel } from "@/domain/habits";
import { dueNudges, type Nudge } from "@/domain/nudges";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/server/env";
import type { AdminClient } from "@/server/supabase/admin";

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  actions: { action: string; title: string }[];
  habitId?: string | null;
  day?: IsoDate;
};

/** Sends one payload; throws an error with `statusCode` on failure. */
export type PushSender = (subscription: Subscription, payload: PushPayload) => Promise<void>;

/** The real sender, or null when VAPID keys aren't configured. */
export function webPushSender(): PushSender | null {
  const publicKey = publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const { VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = serverEnv();
  if (!publicKey || !privateKey || !subject) return null;
  return async (sub, payload) => {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { vapidDetails: { subject, publicKey, privateKey }, TTL: 60 * 60, urgency: "normal" },
    );
  };
}

function gone(e: unknown): boolean {
  const code = (e as { statusCode?: number })?.statusCode;
  return code === 404 || code === 410;
}

/** Sends a payload to every device of a user; drops subscriptions the push service says are gone. */
export async function sendToUser(
  admin: AdminClient,
  userId: string,
  payload: PushPayload,
  send: PushSender,
): Promise<{ delivered: number; removed: number }> {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  let delivered = 0;
  let removed = 0;
  for (const s of subs ?? []) {
    try {
      await send(s, payload);
      delivered++;
      await admin
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", s.id);
    } catch (e) {
      if (gone(e)) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      }
    }
  }
  return { delivered, removed };
}

/** Works out and sends the nudges due for one user right now. */
export async function runNudges(
  admin: AdminClient,
  userId: string,
  { now = new Date(), send }: { now?: Date; send: PushSender },
): Promise<{ sent: Nudge[] }> {
  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (!count) return { sent: [] };

  const { data: settings } = await admin
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (!settings) return { sent: [] };
  const tz = settings.timezone;
  const rollover = settings.day_rollover;
  const day = logicalDay(now, tz, rollover);
  const historyFrom = addDays(day, -60);

  const [habits, logs, review, openTasks, tomorrowPlan, blocks, sent] = await Promise.all([
    admin
      .from("habits")
      .select(
        "id, name, minimum_version, schedule_kind, schedule_days, per_week, target_time, grace_allowed, grace_window, starts_on",
      )
      .eq("user_id", userId)
      .is("archived_at", null),
    admin
      .from("habit_logs")
      .select("habit_id, day, level")
      .eq("user_id", userId)
      .gte("day", historyFrom)
      .lte("day", day),
    admin
      .from("reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "daily")
      .eq("period_start", day)
      .maybeSingle(),
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "open")
      .eq("planned_for", day),
    admin
      .from("day_plans")
      .select("mit_task_id")
      .eq("user_id", userId)
      .eq("day", addDays(day, 1))
      .maybeSingle(),
    admin
      .from("calendar_blocks")
      .select("starts_at, ends_at, outcome")
      .eq("user_id", userId)
      .eq("kind", "focus")
      .eq("day", day)
      .is("deleted_at", null),
    admin.from("nudges_sent").select("key").eq("user_id", userId).eq("day", day),
  ]);

  const logsByHabit = new Map<string, Map<IsoDate, LogLevel>>();
  for (const l of logs.data ?? []) {
    if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, new Map());
    logsByHabit.get(l.habit_id)!.set(l.day, l.level as LogLevel);
  }

  const due = dueNudges({
    now,
    day,
    timeZone: tz,
    rollover,
    shutdownTime: settings.shutdown_time,
    habitNudges: settings.nudge_habits,
    shutdownNudge: settings.nudge_shutdown,
    dayClosed: Boolean(review.data),
    openTasks: openTasks.count ?? 0,
    tomorrowHasFirstTask: Boolean(tomorrowPlan.data?.mit_task_id),
    focusBlocks: (blocks.data ?? [])
      .filter((b) => b.outcome !== "skipped")
      .map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) })),
    sent: new Set((sent.data ?? []).map((s) => s.key)),
    habits: (habits.data ?? []).map((h) => {
      const rule = {
        scheduleKind: h.schedule_kind as "daily" | "days" | "per_week",
        scheduleDays: h.schedule_days,
        perWeek: h.per_week,
        graceAllowed: h.grace_allowed,
        graceWindow: h.grace_window,
        startsOn: compareDates(h.starts_on, historyFrom) < 0 ? historyFrom : h.starts_on,
      };
      const habitLogs = logsByHabit.get(h.id) ?? new Map();
      return {
        id: h.id,
        name: h.name,
        minimumVersion: h.minimum_version,
        targetTime: h.target_time,
        // N-per-week habits have no fixed day to nudge on.
        scheduledToday: h.schedule_kind !== "per_week" && isScheduledOn(rule, day),
        loggedToday: habitLogs.has(day),
        neverMissTwice: computeStreak(rule, habitLogs, day, settings.week_start).neverMissTwice,
      };
    }),
  });

  const delivered: Nudge[] = [];
  for (const n of due) {
    const result = await sendToUser(
      admin,
      userId,
      {
        title: n.title,
        body: n.body,
        url: n.url,
        tag: n.key,
        actions: n.actions,
        habitId: n.refId,
        day,
      },
      send,
    );
    if (result.delivered > 0) {
      await admin
        .from("nudges_sent")
        .upsert(
          { user_id: userId, day, key: n.key },
          { onConflict: "user_id,day,key", ignoreDuplicates: true },
        );
      delivered.push(n);
    }
  }
  return { sent: delivered };
}
