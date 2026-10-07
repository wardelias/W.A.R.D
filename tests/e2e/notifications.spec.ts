import { expect, test } from "@playwright/test";
import { goto, resetUserData } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

test("settings explain nudges and save the switches", async ({ page }) => {
  await goto(page, "/settings");
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Notifications" }) });
  await expect(section).toContainText(/At most 4 a day|aren't configured/);
  if (await section.getByText("At most 4 a day").isVisible()) {
    await section.getByLabel("Shutdown reminder").uncheck();
    await page.waitForTimeout(500);
    await goto(page, "/settings");
    await expect(section.getByLabel("Shutdown reminder")).not.toBeChecked();
    await expect(section.getByLabel("Habit nudges")).toBeChecked();
  }
});

test("a notification action logs the habit (session and same origin required)", async ({
  page,
  browser,
}) => {
  await goto(page, "/habits/new");
  await page.getByLabel("Name").fill("Walk");
  await page.getByLabel("Minimum version").fill("5 min");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: /Walk/ })).toBeVisible();
  const habitId = page.url().split("/").pop()!;

  const foreign = await page.request.post("/api/push/log", {
    data: { habitId, level: "minimum" },
    headers: { Origin: "https://evil.example" },
  });
  expect(foreign.status()).toBe(403);

  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const noSession = await anonymous.request.post("/api/push/log", {
    data: { habitId, level: "minimum" },
  });
  expect(noSession.status()).toBe(401);
  await anonymous.close();

  const ok = await page.request.post("/api/push/log", { data: { habitId, level: "minimum" } });
  expect(ok.status()).toBe(200);
  await goto(page, "/habits");
  await expect(page.getByRole("listitem").filter({ hasText: "Walk" }).first()).toContainText(
    "minimum",
  );
});
