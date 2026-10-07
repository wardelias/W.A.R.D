import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, logicalDay, logicalInstant } from "@/domain/day";
import { disconnect, getConnection, saveConnection } from "@/server/google/accounts";
import { fakeGoogleSide, fakeProvider, resetFakeCalendar } from "@/server/google/fake-provider";
import { eventIdForBlock } from "@/server/google/provider";
import { setupCalendars } from "@/server/google/setup";
import { syncUser } from "@/server/google/sync";
import { createAdminClient } from "@/server/supabase/admin";
import { admin as sql, createUser, deleteUser, goalIds, pool } from "../db/helpers";

const db = createAdminClient();
const TZ = "Asia/Jerusalem";
let userId: string;
let wardId: string;
let goal: string;
const now = new Date();
const today = logicalDay(now, TZ);
const at = (day: string, time: string) => logicalInstant(day, time, TZ);
const tomorrow = addDays(today, 1);

async function connect() {
  await saveConnection(db, userId, {
    sub: "fake",
    email: "me@test",
    scopes: [],
    refreshToken: "x",
  });
  const { wardCalendarId } = await setupCalendars(db, userId, TZ);
  wardId = wardCalendarId;
}

async function insertBlock(over: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  const start = at(tomorrow, "11:00");
  const { error } = await db.from("calendar_blocks").insert({
    id,
    user_id: userId,
    kind: "focus",
    goal_id: goal,
    title: "סיכום הרצאה 4",
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
    day: tomorrow,
    google_event_id: eventIdForBlock(id),
    sync_state: "pending",
    ...over,
  });
  if (error) throw error;
  return id;
}

async function block(id: string) {
  const { data } = await db.from("calendar_blocks").select("*").eq("id", id).single();
  return data!;
}

async function wardEvents(showDeleted = false) {
  return fakeProvider.listEvents(userId, wardId, {
    timeMin: new Date(now.getTime() - 30 * 86_400_000),
    timeMax: new Date(now.getTime() + 60 * 86_400_000),
    showDeleted,
  });
}

beforeEach(async () => {
  resetFakeCalendar();
  if (userId) await deleteUser(userId);
  userId = await createUser();
  [goal] = await goalIds(userId);
  await connect();
});

afterAll(async () => {
  if (userId) await deleteUser(userId);
  await pool.end();
});

describe("connecting", () => {
  it("creates the W.A.R.D. calendar and shows the primary calendar by default", async () => {
    const { data } = await db
      .from("calendars")
      .select("summary, selected, is_ward")
      .eq("user_id", userId)
      .order("summary");
    expect(data).toEqual([
      { summary: "Primary", selected: true, is_ward: false },
      { summary: "W.A.R.D.", selected: false, is_ward: true },
    ]);
    expect((await getConnection(db, userId))?.wardCalendarId).toBe(wardId);
  });

  it("reconnecting reuses the existing W.A.R.D. calendar and keeps choices", async () => {
    await db
      .from("calendars")
      .update({ selected: false })
      .eq("user_id", userId)
      .eq("summary", "Primary");
    await connect();
    const { data } = await db.from("calendars").select("summary, selected").eq("user_id", userId);
    expect(data?.filter((c) => c.summary === "W.A.R.D.")).toHaveLength(1);
    expect(data?.find((c) => c.summary === "Primary")?.selected).toBe(false);
  });
});

describe("outside calendars (read-only cache)", () => {
  it("caches events in the window and drops ones deleted in Google", async () => {
    const primary = `primary-${userId}`;
    const lecture = await fakeGoogleSide.addEvent(userId, primary, {
      status: "confirmed",
      summary: "Data Structures lecture",
      start: { dateTime: at(tomorrow, "13:00").toISOString() },
      end: { dateTime: at(tomorrow, "14:30").toISOString() },
    });
    await fakeGoogleSide.addEvent(userId, primary, {
      status: "confirmed",
      summary: "Far future",
      start: { dateTime: at(addDays(today, 60), "10:00").toISOString() },
      end: { dateTime: at(addDays(today, 60), "11:00").toISOString() },
    });
    await syncUser(db, userId);
    let { data } = await db.from("calendar_events").select("title").eq("user_id", userId);
    expect(data?.map((e) => e.title)).toEqual(["Data Structures lecture"]);

    await fakeGoogleSide.deleteEvent(userId, primary, lecture.id);
    await syncUser(db, userId);
    ({ data } = await db.from("calendar_events").select("title").eq("user_id", userId));
    expect(data).toEqual([]);
  });

  it("never writes to outside calendars", async () => {
    await insertBlock();
    await syncUser(db, userId);
    const primaryEvents = await fakeProvider.listEvents(userId, `primary-${userId}`, {
      timeMin: new Date(0),
      timeMax: new Date(now.getTime() + 365 * 86_400_000),
    });
    expect(primaryEvents).toEqual([]);
  });
});

describe("W.A.R.D. blocks (two-way)", () => {
  it("pushes a new block with an id derived from the block and an isolated title", async () => {
    const id = await insertBlock();
    const result = await syncUser(db, userId);
    expect(result.pushed).toBe(1);
    const [event] = await wardEvents();
    expect(event.id).toBe(eventIdForBlock(id));
    expect(event.summary).toBe("Focus · ⁨סיכום הרצאה 4⁩");
    expect(event.reminders?.overrides).toEqual([{ method: "popup", minutes: 0 }]);
    const b = await block(id);
    expect(b.sync_state).toBe("synced");
    expect(b.google_etag).toBe(event.etag);
  });

  it("a retried insert never duplicates the event", async () => {
    const id = await insertBlock();
    await syncUser(db, userId);
    // Simulate a lost response: the block still looks unpushed.
    await db
      .from("calendar_blocks")
      .update({ google_etag: null, sync_state: "pending", changed_at: new Date().toISOString() })
      .eq("id", id);
    await syncUser(db, userId);
    expect(await wardEvents()).toHaveLength(1);
    expect((await block(id)).sync_state).toBe("synced");
  });

  it("applies a move made in Google, recomputing the day", async () => {
    const id = await insertBlock();
    await syncUser(db, userId);
    const dayAfter = addDays(tomorrow, 1);
    await fakeGoogleSide.moveEvent(
      userId,
      wardId,
      eventIdForBlock(id),
      at(dayAfter, "18:00").toISOString(),
      at(dayAfter, "18:45").toISOString(),
    );
    const result = await syncUser(db, userId);
    expect(result.pulled).toBe(1);
    const b = await block(id);
    expect(new Date(b.starts_at).toISOString()).toBe(at(dayAfter, "18:00").toISOString());
    expect(b.day).toBe(dayAfter);
  });

  it("a deletion in Google removes the block (tombstone)", async () => {
    const id = await insertBlock();
    await syncUser(db, userId);
    await fakeGoogleSide.deleteEvent(userId, wardId, eventIdForBlock(id));
    await syncUser(db, userId);
    expect((await block(id)).deleted_at).not.toBeNull();
  });

  it("pushes a local move using the etag", async () => {
    const id = await insertBlock();
    await syncUser(db, userId);
    const start = at(tomorrow, "15:00");
    await db
      .from("calendar_blocks")
      .update({
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
        sync_state: "pending",
        changed_at: new Date().toISOString(),
      })
      .eq("id", id);
    await syncUser(db, userId);
    const [event] = await wardEvents();
    expect(event.start?.dateTime).toBe(start.toISOString());
  });

  it("pushes a local delete", async () => {
    const id = await insertBlock();
    await syncUser(db, userId);
    await db
      .from("calendar_blocks")
      .update({
        deleted_at: new Date().toISOString(),
        sync_state: "pending",
        changed_at: new Date().toISOString(),
      })
      .eq("id", id);
    await syncUser(db, userId);
    expect(await wardEvents()).toHaveLength(0);
    expect((await wardEvents(true))[0].status).toBe("cancelled");
  });

  it("conflict: the newer change wins", async () => {
    const id = await insertBlock();
    await syncUser(db, userId);
    // Local change made earlier than the Google change → Google wins.
    await db
      .from("calendar_blocks")
      .update({
        title: "local title",
        sync_state: "pending",
        changed_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq("id", id);
    await fakeGoogleSide.moveEvent(
      userId,
      wardId,
      eventIdForBlock(id),
      at(tomorrow, "19:00").toISOString(),
      at(tomorrow, "19:45").toISOString(),
    );
    const r1 = await syncUser(db, userId);
    expect(r1.conflicts).toBeGreaterThan(0);
    let b = await block(id);
    expect(new Date(b.starts_at).toISOString()).toBe(at(tomorrow, "19:00").toISOString());

    // Local change made after the Google change → local wins.
    await fakeGoogleSide.moveEvent(
      userId,
      wardId,
      eventIdForBlock(id),
      at(tomorrow, "20:00").toISOString(),
      at(tomorrow, "20:45").toISOString(),
    );
    await new Promise((r) => setTimeout(r, 5));
    const start = at(tomorrow, "12:00");
    await db
      .from("calendar_blocks")
      .update({
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
        sync_state: "pending",
        changed_at: new Date().toISOString(),
      })
      .eq("id", id);
    await syncUser(db, userId);
    b = await block(id);
    expect(new Date(b.starts_at).toISOString()).toBe(start.toISOString());
    const [event] = await wardEvents();
    expect(event.start?.dateTime).toBe(start.toISOString());
  });

  it("imports an event created directly in the W.A.R.D. calendar as an untagged focus block", async () => {
    await fakeGoogleSide.addEvent(userId, wardId, {
      status: "confirmed",
      summary: "Deep work",
      start: { dateTime: at(tomorrow, "09:00").toISOString() },
      end: { dateTime: at(tomorrow, "10:30").toISOString() },
    });
    await syncUser(db, userId);
    const { data } = await db
      .from("calendar_blocks")
      .select("kind, title, goal_id, day")
      .eq("user_id", userId);
    expect(data).toEqual([{ kind: "focus", title: "Deep work", goal_id: null, day: tomorrow }]);
    // Not imported twice
    await syncUser(db, userId);
    expect((await db.from("calendar_blocks").select("id").eq("user_id", userId)).data).toHaveLength(
      1,
    );
  });
});

describe("habit blocks", () => {
  it("creates a week of blocks for a daily habit with a time, and doesn't re-create a deleted one", async () => {
    await sql(
      `insert into public.habits (user_id, goal_id, name, minimum_version, schedule_kind, target_time, block_min, starts_on)
       values ($1, $2, 'Gym', '10 push-ups', 'daily', '23:30', 60, $3)`,
      [userId, goal, today],
    );
    await syncUser(db, userId);
    const { data } = await db
      .from("calendar_blocks")
      .select("id, day, sync_state")
      .eq("user_id", userId)
      .eq("kind", "habit")
      .order("day");
    expect(data!.length).toBeGreaterThanOrEqual(6); // today's may already be past
    expect(data!.every((b) => b.sync_state === "synced")).toBe(true);
    expect((await wardEvents()).length).toBe(data!.length);

    // Delete one in Google: it stays deleted on the next sync.
    const victim = data![1];
    await fakeGoogleSide.deleteEvent(userId, wardId, eventIdForBlock(victim.id));
    await syncUser(db, userId);
    await syncUser(db, userId);
    const after = await db
      .from("calendar_blocks")
      .select("id, deleted_at")
      .eq("habit_id", (await block(victim.id)).habit_id!)
      .eq("day", victim.day);
    expect(after.data).toHaveLength(1);
    expect(after.data![0].deleted_at).not.toBeNull();
  });
});

describe("disconnecting", () => {
  it("removes tokens and cache, keeps blocks, and can remove the W.A.R.D. calendar", async () => {
    const id = await insertBlock();
    await syncUser(db, userId);
    await disconnect(db, userId, { removeWardCalendar: true });
    expect(await getConnection(db, userId)).toBeNull();
    expect((await db.from("calendars").select("*").eq("user_id", userId)).data).toEqual([]);
    const b = await block(id);
    expect(b.deleted_at).toBeNull();
    expect(b.sync_state).toBe("pending");
    expect((await fakeProvider.listCalendars(userId)).map((c) => c.summary)).toEqual(["Primary"]);
  });
});
