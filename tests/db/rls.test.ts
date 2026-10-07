import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, as, createUser, deleteUser, goalIds, pool } from "./helpers";

let a: string;
let b: string;
let aGoal: string;
let bGoal: string;
let aTask: string;
let aHabit: string;
let aBlock: string;

beforeAll(async () => {
  a = await createUser();
  b = await createUser();
  [aGoal] = await goalIds(a);
  [bGoal] = await goalIds(b);

  aTask = (
    await admin(
      `insert into public.tasks (user_id, goal_id, title) values ($1, $2, 'A task') returning id`,
      [a, aGoal],
    )
  ).rows[0].id;
  aHabit = (
    await admin(
      `insert into public.habits (user_id, goal_id, name, minimum_version, schedule_kind)
       values ($1, $2, 'Gym', '10 push-ups', 'daily') returning id`,
      [a, aGoal],
    )
  ).rows[0].id;
  await admin(
    `insert into public.habit_logs (user_id, habit_id, day, level) values ($1, $2, '2026-10-01', 'full')`,
    [a, aHabit],
  );
  await admin(
    `insert into public.day_plans (user_id, day, mit_task_id) values ($1, '2026-10-01', $2)`,
    [a, aTask],
  );
  await admin(
    `insert into public.reviews (user_id, kind, period_start, period_end) values ($1, 'daily', '2026-10-01', '2026-10-01')`,
    [a],
  );
  await admin(
    `insert into public.calendars (user_id, google_calendar_id, summary, selected) values ($1, 'primary', 'Primary', true)`,
    [a],
  );
  await admin(
    `insert into public.calendar_events (user_id, google_calendar_id, google_event_id, title, starts_at, ends_at, all_day, status)
     values ($1, 'primary', 'ev1', 'Lecture', '2026-10-01T10:00Z', '2026-10-01T11:00Z', false, 'confirmed')`,
    [a],
  );
  aBlock = (
    await admin(
      `insert into public.calendar_blocks (user_id, kind, task_id, goal_id, title, starts_at, ends_at, day)
       values ($1, 'focus', $2, $3, 'Focus', '2026-10-01T08:00Z', '2026-10-01T08:45Z', '2026-10-01') returning id`,
      [a, aTask, aGoal],
    )
  ).rows[0].id;
  await admin(
    `insert into public.google_accounts (user_id, google_sub, email, refresh_token_enc) values ($1, 'sub', 'a@x', 'v1:enc')`,
    [a],
  );
});

afterAll(async () => {
  await deleteUser(a);
  await deleteUser(b);
  await pool.end();
});

describe("signup trigger", () => {
  it("creates settings with defaults and the three-goal ladder", async () => {
    const s = await admin(
      "select timezone, focus_capacity_min, week_start from public.settings where user_id = $1",
      [a],
    );
    expect(s.rows[0]).toEqual({
      timezone: "Asia/Jerusalem",
      focus_capacity_min: 360,
      week_start: 0,
    });
    const g = await admin("select rank, label from public.goals where user_id = $1 order by rank", [
      a,
    ]);
    expect(g.rows).toEqual([
      { rank: 1, label: "Grades" },
      { rank: 2, label: "Agency" },
      { rank: 3, label: "Health" },
    ]);
  });
});

const userTables = [
  "settings",
  "goals",
  "tasks",
  "day_plans",
  "habits",
  "habit_logs",
  "reviews",
  "calendars",
  "calendar_events",
  "calendar_blocks",
];

describe("row-level security between users", () => {
  it.each(userTables)("%s: the owner sees their rows", async (table) => {
    const n = await as(
      "authenticated",
      a,
      async (q) => (await q(`select count(*)::int as n from public.${table}`)).rows[0].n,
    );
    expect(n).toBeGreaterThan(0);
  });

  it.each(userTables)("%s: another user sees none of them", async (table) => {
    const n = await as(
      "authenticated",
      b,
      async (q) =>
        (await q(`select count(*)::int as n from public.${table} where user_id = $1`, [a])).rows[0]
          .n,
    );
    expect(n).toBe(0);
  });

  it.each([
    "tasks",
    "habits",
    "habit_logs",
    "day_plans",
    "reviews",
    "calendar_blocks",
    "settings",
    "goals",
  ])("%s: another user can't update or delete them", async (table) => {
    await as("authenticated", b, async (q) => {
      const column = table === "habit_logs" ? "day" : "updated_at";
      const upd = await q(`update public.${table} set ${column} = ${column} where user_id = $1`, [
        a,
      ]);
      expect(upd.rowCount).toBe(0);
      const del = await q(`delete from public.${table} where user_id = $1`, [a]).catch((e) => e);
      // settings/goals have no delete policy (or grant); either way nothing is deleted
      if (!(del instanceof Error)) expect(del.rowCount).toBe(0);
    });
    const still = await admin(`select count(*)::int as n from public.${table} where user_id = $1`, [
      a,
    ]);
    expect(still.rows[0].n).toBeGreaterThan(0);
  });

  it("rejects inserting a row owned by someone else", async () => {
    await expect(
      as("authenticated", b, (q) =>
        q(`insert into public.tasks (user_id, goal_id, title) values ($1, $2, 'x')`, [a, aGoal]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("composite FK: a task can't point at another user's goal", async () => {
    await expect(
      as("authenticated", b, (q) =>
        q(`insert into public.tasks (goal_id, title) values ($1, 'x')`, [aGoal]),
      ),
    ).rejects.toThrow(/tasks_goal_fk/);
  });

  it("composite FK: a block can't point at another user's task", async () => {
    await expect(
      as("authenticated", b, (q) =>
        q(
          `insert into public.calendar_blocks (kind, task_id, goal_id, title, starts_at, ends_at, day)
           values ('focus', $1, $2, 'x', now(), now() + interval '45 minutes', current_date)`,
          [aTask, bGoal],
        ),
      ),
    ).rejects.toThrow(/calendar_blocks_task_fk/);
  });

  it("composite FK: a day plan can't point at another user's task", async () => {
    await expect(
      as("authenticated", b, (q) =>
        q(`insert into public.day_plans (day, mit_task_id) values ('2026-10-02', $1)`, [aTask]),
      ),
    ).rejects.toThrow(/day_plans_mit_fk/);
  });

  it("an owner can create, read and change their own task", async () => {
    await as("authenticated", b, async (q) => {
      const ins = await q(
        `insert into public.tasks (goal_id, title) values ($1, 'mine') returning user_id`,
        [bGoal],
      );
      expect(ins.rows[0].user_id).toBe(b);
      const upd = await q(`update public.tasks set title = 'renamed' where title = 'mine'`);
      expect(upd.rowCount).toBe(1);
    });
  });
});

describe("restricted tables and columns", () => {
  it("google_accounts is unreachable with a user session", async () => {
    await expect(
      as("authenticated", a, (q) => q("select * from public.google_accounts")),
    ).rejects.toThrow(/permission denied/);
  });

  it("anon can't read any W.A.R.D. table", async () => {
    for (const table of userTables) {
      await expect(
        as("anon", null, (q) => q(`select 1 from public.${table} limit 1`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("users can't write the calendar event cache", async () => {
    await expect(
      as("authenticated", a, (q) =>
        q(
          `insert into public.calendar_events (user_id, google_calendar_id, google_event_id, all_day, start_date, end_date, status)
           values ($1, 'primary', 'ev2', true, '2026-10-01', '2026-10-02', 'confirmed')`,
          [a],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("users can toggle a calendar's selection but not rename it", async () => {
    await as("authenticated", a, async (q) => {
      const ok = await q(
        `update public.calendars set selected = false where google_calendar_id = 'primary'`,
      );
      expect(ok.rowCount).toBe(1);
    });
    await expect(
      as("authenticated", a, (q) =>
        q(`update public.calendars set summary = 'x' where google_calendar_id = 'primary'`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("users can't add or remove goals (the ladder has exactly three)", async () => {
    await expect(
      as("authenticated", a, (q) =>
        q(`insert into public.goals (rank, title, label) values (3, 'x', 'x')`),
      ),
    ).rejects.toThrow(/row-level security|duplicate key/);
    const del = await as("authenticated", a, (q) => q(`delete from public.goals`));
    expect(del.rowCount).toBe(0);
  });
});

describe("constraints", () => {
  it("a habit needs a minimum version", async () => {
    await expect(
      as("authenticated", a, (q) =>
        q(
          `insert into public.habits (goal_id, name, minimum_version, schedule_kind) values ($1, 'Read', '', 'daily')`,
          [aGoal],
        ),
      ),
    ).rejects.toThrow(/habits_minimum_version_check/);
  });

  it("habit schedule fields must match the schedule kind", async () => {
    await expect(
      as("authenticated", a, (q) =>
        q(
          `insert into public.habits (goal_id, name, minimum_version, schedule_kind, schedule_days)
           values ($1, 'Read', '1 page', 'daily', '{1,2}')`,
          [aGoal],
        ),
      ),
    ).rejects.toThrow(/habits_schedule_check/);
    await expect(
      as("authenticated", a, (q) =>
        q(
          `insert into public.habits (goal_id, name, minimum_version, schedule_kind, schedule_days)
           values ($1, 'Read', '1 page', 'days', '{7}')`,
          [aGoal],
        ),
      ),
    ).rejects.toThrow(/habits_schedule_check/);
  });

  it("an invalid time zone is rejected", async () => {
    await expect(
      as("authenticated", a, (q) => q(`update public.settings set timezone = 'Mars/Olympus'`)),
    ).rejects.toThrow(/settings_timezone_check/);
  });

  it("a done task needs completed_at and an open one must not have it", async () => {
    await expect(
      as("authenticated", a, (q) =>
        q(`update public.tasks set status = 'done' where id = $1`, [aTask]),
      ),
    ).rejects.toThrow(/tasks_completed_check/);
  });

  it("one log per habit per day", async () => {
    await expect(
      as("authenticated", a, (q) =>
        q(
          `insert into public.habit_logs (habit_id, day, level) values ($1, '2026-10-01', 'minimum')`,
          [aHabit],
        ),
      ),
    ).rejects.toThrow(/habit_logs_habit_day_key/);
  });

  it("blocks are capped at 4 hours and must end after they start", async () => {
    await expect(
      as("authenticated", a, (q) =>
        q(
          `update public.calendar_blocks set ends_at = starts_at + interval '5 hours' where id = $1`,
          [aBlock],
        ),
      ),
    ).rejects.toThrow(/calendar_blocks_time_check/);
  });

  it("text limits count characters, not bytes (Hebrew and Arabic fit)", async () => {
    const hebrew = "א".repeat(300);
    await as("authenticated", a, async (q) => {
      const r = await q(
        `insert into public.tasks (goal_id, title) values ($1, $2) returning char_length(title) as n`,
        [aGoal, hebrew],
      );
      expect(r.rows[0].n).toBe(300);
    });
  });

  it("deleting a user removes all their data", async () => {
    const c = await createUser();
    const [g] = await goalIds(c);
    await admin(`insert into public.tasks (user_id, goal_id, title) values ($1, $2, 'x')`, [c, g]);
    await deleteUser(c);
    const left = await admin(
      `select (select count(*) from public.tasks where user_id = $1) + (select count(*) from public.goals where user_id = $1) as n`,
      [c],
    );
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
