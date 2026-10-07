import { expect, test } from "@playwright/test";
import { connectGoogle, E2E_EMAIL, fakeGoogle, resetUserData } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

test("connect Google Calendar, see outside events on Today, hide a calendar, disconnect", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(page.getByText("to see your day here.")).toBeVisible();

  await connectGoogle(page);
  await expect(page.getByText(`Connected as ${E2E_EMAIL}`)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Primary" })).toBeChecked();

  // Overlaps "now", so it's on today's logical day whatever the time.
  const start = new Date(Date.now() - 30 * 60_000);
  const end = new Date(Date.now() + 30 * 60_000);
  await fakeGoogle(page, {
    op: "add",
    calendar: "primary",
    summary: "Data Structures lecture",
    start: start.toISOString(),
    end: end.toISOString(),
  });
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Synced.")).toBeVisible();

  await page.goto("/today");
  const calendar = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Calendar" }) });
  await expect(calendar).toContainText("Data Structures lecture");
  await expect(calendar).toContainText("Primary");
  await expect(calendar).toContainText(/synced (just now|\d+ min ago)/);

  // Hide the primary calendar: its events leave Today
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: "Primary" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "Primary" })).not.toBeChecked();
  await page.waitForTimeout(500);
  await page.goto("/today");
  await expect(calendar).not.toContainText("Data Structures lecture");

  // Disconnect (and remove the W.A.R.D. calendar)
  await page.goto("/settings");
  await page.getByRole("button", { name: "Disconnect…" }).click();
  await page.getByLabel("Also delete the “W.A.R.D.” calendar from Google").check();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
});

test("the cron endpoint needs the secret", async ({ request }) => {
  const res = await request.post("/api/cron/tick");
  expect(res.status()).toBe(401);
  const wrong = await request.post("/api/cron/tick", { headers: { Authorization: "Bearer nope" } });
  expect(wrong.status()).toBe(401);
  const secret = process.env.CRON_SECRET ?? "local-dev-cron-secret-0123456789abcdef";
  const ok = await request.post("/api/cron/tick", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ synced: expect.any(Number), failed: 0 });
});

test("the test-only calendar route needs a session", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const res = await context.request.post("/api/test/fake-calendar", { data: { op: "list" } });
  expect(res.status()).toBe(401);
  await context.close();
});
