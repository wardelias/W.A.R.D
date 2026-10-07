import { expect, test } from "@playwright/test";
import { resetUserData, setOnboarded, goto } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
  await setOnboarded(false);
});

test.afterEach(async () => {
  await setOnboarded(true);
});

test("first run: confirm the day, the ladder, skip Google, add starter habits", async ({
  page,
}) => {
  await goto(page, "/today");
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole("heading", { name: "Your day" })).toBeVisible();
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Jerusalem");
  await expect(page.getByLabel("Window 1 start")).toHaveValue("11:00");
  await expect(page.getByLabel("Capacity (h/day)")).toHaveValue("6");
  await page.getByRole("button", { name: "Looks right" }).click();

  await expect(page.getByRole("heading", { name: "Goal ladder" })).toBeVisible();
  await expect(page.getByLabel("Short label for priority 1")).toHaveValue("Grades");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Google Calendar" })).toBeVisible();
  await page.getByRole("link", { name: "Later" }).click();

  await expect(page.getByRole("heading", { name: "First habits (optional)" })).toBeVisible();
  await page.getByRole("button", { name: "Add selected and start" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const habits = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Habits" }) });
  await expect(habits).toContainText("Gym");
  await expect(habits).toContainText("Read 20 min");
});
