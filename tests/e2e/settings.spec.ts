import { expect, test } from "@playwright/test";
import { resetUserData, goto } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

test("capacity, goal order and names, and theme are saved and used", async ({ page }) => {
  await goto(page, "/settings");
  await page.getByLabel("Capacity (h/day)").fill("5");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved.").first()).toBeVisible();

  // Health becomes priority 2, renamed in Hebrew
  await page.getByRole("button", { name: "Move Health up" }).click();
  await page.getByLabel("Short label for priority 2").fill("בריאות");
  const ladder = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Goal ladder" }) });
  await ladder.getByRole("button", { name: "Save" }).click();
  await expect(ladder.getByText("Saved.")).toBeVisible();

  await goto(page, "/week");
  await expect(page.getByText("capacity 5h/day")).toBeVisible();

  await goto(page, "/tasks");
  await page.getByLabel("Add a task").fill("x");
  const chips = page
    .locator("form")
    .filter({ has: page.getByLabel("Add a task") })
    .getByRole("group", { name: "Goal" })
    .locator("label");
  await expect(chips.nth(0)).toHaveText("Grades");
  await expect(chips.nth(1)).toHaveText("בריאות");
  await expect(chips.nth(2)).toHaveText("Agency");

  // Theme: dark sticks across a reload (cookie + saved setting)
  await goto(page, "/settings");
  await page
    .locator("label")
    .filter({ hasText: /^Dark$/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .locator("label")
    .filter({ hasText: /^System$/ })
    .click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

test("invalid schedule values are refused with a clear message", async ({ page }) => {
  await goto(page, "/settings");
  await page.getByLabel("Day ends at").fill("08:00");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("The day can end at 06:00 at the latest.")).toBeVisible();
});
