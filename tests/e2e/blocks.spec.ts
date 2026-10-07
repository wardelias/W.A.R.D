import { expect, test } from "@playwright/test";
import {
  blockIdFromEventId,
  choose,
  connectGoogle,
  fakeGoogle,
  logicalDate,
  quickAdd,
  resetUserData,
} from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

type FakeEvent = { id: string; status: string; summary: string; start: { dateTime: string } };

test("schedule focus blocks, see them in Google, apply a move made in Google, delete one", async ({
  page,
}) => {
  await connectGoogle(page);
  await page.goto("/today");
  const input = page.getByLabel("Add a task");
  await input.fill("Algorithms HW");
  await choose(quickAdd(page), "Grades");
  await choose(quickAdd(page), "90m");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: /Algorithms HW/ }).click();
  await page.getByRole("link", { name: "Schedule" }).click();
  await expect(page.getByRole("heading", { name: /Focus for: Algorithms HW/ })).toBeVisible();

  // Tomorrow, 2 blocks: deterministic regardless of the time of day the test runs.
  const url = new URL(page.url());
  url.searchParams.set("day", logicalDate(1));
  url.searchParams.set("count", "2");
  await page.goto(url.toString());
  await expect(page.getByText("Adds to Google Calendar “W.A.R.D.”")).toBeVisible();
  const previews = page
    .locator("section")
    .filter({ hasText: "Adds to Google Calendar" })
    .getByRole("listitem");
  await expect(previews).toHaveCount(2);
  await expect(previews.first()).toContainText("11:00–11:45");
  await expect(previews.nth(1)).toContainText("12:00–12:45");
  await expect(page.getByText("Tomorrow after this: 1h 30m of 6h")).toBeVisible();
  await page.getByRole("button", { name: "Add 2 blocks" }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Both are in the W.A.R.D. calendar with the block id as event id
  let ward = (await fakeGoogle(page, { op: "list" })) as {
    ward: FakeEvent[];
    primary: FakeEvent[];
  };
  expect(ward.ward).toHaveLength(2);
  expect(ward.primary).toHaveLength(0);
  expect(ward.ward[0].summary).toBe("Focus · ⁨Algorithms HW⁩");

  // Move the first one in Google to 18:00 local, then sync
  const first = ward.ward.sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime))[0];
  const start = new Date(first.start.dateTime);
  const moved = new Date(start.getTime() + 7 * 3_600_000);
  await fakeGoogle(page, {
    op: "move",
    eventId: first.id,
    start: moved.toISOString(),
    end: new Date(moved.getTime() + 45 * 60_000).toISOString(),
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Synced.")).toBeVisible();

  const blockId = blockIdFromEventId(first.id);
  await page.goto(`/blocks/${blockId}`);
  await expect(page.getByText(/18:00–18:45 · W\.A\.R\.D\./)).toBeVisible();

  // Delete it from W.A.R.D. after seeing exactly what will be removed
  await page.getByRole("button", { name: "Delete…" }).click();
  await expect(
    page.getByText(/Removes “Focus · Algorithms HW” .* from Google Calendar “W\.A\.R\.D\.”/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  ward = await fakeGoogle(page, { op: "list" });
  expect(ward.ward.map((e) => e.id)).not.toContain(first.id);
  expect(ward.ward).toHaveLength(1);
});

test("move a block from W.A.R.D. with a preview of the change", async ({ page }) => {
  await connectGoogle(page);
  await page.goto(`/focus/new?day=${logicalDate(1)}&count=1`);
  await page.getByRole("button", { name: "Add 1 block" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const { ward } = (await fakeGoogle(page, { op: "list" })) as { ward: FakeEvent[] };
  await page.goto(`/blocks/${blockIdFromEventId(ward[0].id)}`);
  await page.getByLabel("Time", { exact: true }).fill("19:00");
  await expect(
    page.getByText(
      /Moves “Focus · Focus” from .* to .* 19:00–19:45 in Google Calendar “W\.A\.R\.D\.”/,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByText(/Moved to/)).toBeVisible();
  const after = (await fakeGoogle(page, { op: "list" })) as { ward: FakeEvent[] };
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  expect(local.format(new Date(after.ward[0].start.dateTime))).toBe("19:00");
});
