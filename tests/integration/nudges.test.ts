import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays, logicalInstant } from "@/domain/day";
import { stripIsolates } from "@/domain/text";
import { runNudges, type PushPayload, type PushSender } from "@/server/push/sender";
import { createAdminClient } from "@/server/supabase/admin";
import { userCtx } from "./ctx";

const admin = createAdminClient();
let ctx: Awaited<ReturnType<typeof userCtx>>;
let sent: { endpoint: string; payload: PushPayload }[];
const sender: PushSender = async (sub, payload) => {
  if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
  sent.push({ endpoint: sub.endpoint, payload });
};
const at = (time: string, day = ctx.today) => logicalInstant(day, time, "Asia/Jerusalem");

async function subscribe(endpoint = "https://push.example/device-1") {
  await ctx.db.from("push_subscriptions").insert({ endpoint, p256dh: "p", auth: "a" });
}

async function habit(
  name: string,
  time: string,
  minimum = "1 page",
  startsOn = addDays(ctx.today, -3),
) {
  const goal = (await ctx.db.from("goals").select("id").eq("rank", 1).single()).data!.id;
  return (
    await ctx.db
      .from("habits")
      .insert({
        name,
        minimum_version: minimum,
        goal_id: goal,
        schedule_kind: "daily",
        target_time: time,
        starts_on: startsOn,
      })
      .select("id")
      .single()
  ).data!.id;
}

beforeEach(async () => {
  ctx = await userCtx();
  sent = [];
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("runNudges", () => {
  it("does nothing without a subscribed device", async () => {
    await habit("Read", "16:00");
    expect((await runNudges(admin, ctx.userId, { now: at("16:05"), send: sender })).sent).toEqual(
      [],
    );
  });

  it("nudges an unlogged habit once, with the never-miss-twice wording after a miss", async () => {
    await subscribe();
    const id = await habit("קריאה", "16:00", "עמוד אחד");
    // Logged two days ago, missed yesterday.
    await ctx.db
      .from("habit_logs")
      .insert({ habit_id: id, day: addDays(ctx.today, -2), level: "full" });
    const first = await runNudges(admin, ctx.userId, { now: at("16:05"), send: sender });
    expect(first.sent).toHaveLength(1);
    expect(stripIsolates(sent[0].payload.title)).toBe("קריאה: never miss twice");
    expect(stripIsolates(sent[0].payload.body)).toBe(
      "Missed last time. The minimum counts: עמוד אחד.",
    );
    expect(sent[0].payload).toMatchObject({ habitId: id, day: ctx.today, url: "/today" });

    const again = await runNudges(admin, ctx.userId, { now: at("16:20"), send: sender });
    expect(again.sent).toEqual([]);
  });

  it("stays quiet during a focus block and once the habit is logged", async () => {
    await subscribe();
    const id = await habit("Gym", "16:00");
    const start = at("16:00");
    await ctx.db.from("calendar_blocks").insert({
      kind: "focus",
      title: "Focus",
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
      day: ctx.today,
      google_event_id: crypto.randomUUID().replace(/-/g, ""),
    });
    expect((await runNudges(admin, ctx.userId, { now: at("16:10"), send: sender })).sent).toEqual(
      [],
    );
    await ctx.db.from("habit_logs").insert({ habit_id: id, day: ctx.today, level: "minimum" });
    expect((await runNudges(admin, ctx.userId, { now: at("16:50"), send: sender })).sent).toEqual(
      [],
    );
  });

  it("sends the shutdown reminder until the day is closed", async () => {
    await subscribe();
    const result = await runNudges(admin, ctx.userId, { now: at("22:40"), send: sender });
    expect(result.sent.map((n) => n.key)).toEqual(["shutdown"]);
    expect(sent[0].payload.url).toBe("/shutdown");
  });

  it("respects the switches in Settings", async () => {
    await subscribe();
    await habit("Gym", "16:00");
    await ctx.db
      .from("settings")
      .update({ nudge_habits: false, nudge_shutdown: false })
      .eq("user_id", ctx.userId);
    expect((await runNudges(admin, ctx.userId, { now: at("16:05"), send: sender })).sent).toEqual(
      [],
    );
    expect((await runNudges(admin, ctx.userId, { now: at("22:45"), send: sender })).sent).toEqual(
      [],
    );
  });

  it("sends to every device and drops subscriptions the push service says are gone", async () => {
    await subscribe("https://push.example/device-1");
    await subscribe("https://push.example/gone-device");
    await runNudges(admin, ctx.userId, { now: at("22:40"), send: sender });
    expect(sent.map((s) => s.endpoint)).toEqual(["https://push.example/device-1"]);
    const { data } = await ctx.db.from("push_subscriptions").select("endpoint");
    expect(data?.map((d) => d.endpoint)).toEqual(["https://push.example/device-1"]);
  });

  it("never sends more than 4 in a day", async () => {
    await subscribe();
    for (const n of ["A", "B", "C", "D", "E"]) await habit(n, "16:00");
    const first = await runNudges(admin, ctx.userId, { now: at("16:05"), send: sender });
    expect(first.sent).toHaveLength(4);
    const later = await runNudges(admin, ctx.userId, { now: at("22:40"), send: sender });
    expect(later.sent).toEqual([]);
  });
});
