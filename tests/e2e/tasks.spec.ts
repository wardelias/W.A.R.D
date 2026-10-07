import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const HEBREW = "סיכום הרצאה 4 בלינארית";
const ARABIC = "تحديث عرض الأسعار للعميل";

test("add, complete, edit and drop tasks in Hebrew, Arabic and English", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await signIn(page);
  await page.goto("/tasks");

  // Quick add: type, pick goal/time/day, Enter
  const input = page.getByLabel("Add a task");
  await input.fill(`${HEBREW} ${suffix}`);
  await page.getByRole("radio", { name: "Grades" }).check({ force: true });
  await page.getByRole("radio", { name: "45m" }).check({ force: true });
  await page.getByRole("radio", { name: "Today" }).check({ force: true });
  await input.press("Enter");
  await expect(input).toHaveValue("");

  const row = page.getByRole("listitem").filter({ hasText: suffix });
  await expect(row).toContainText("45m · Today");
  // The Hebrew title renders right-to-left inside the English UI
  const title = row.locator("bdi");
  await expect(title).toHaveAttribute("dir", "auto");
  expect(await title.evaluate((el) => el.matches(":dir(rtl)"))).toBe(true);

  // A second task in Agency, planned later
  await input.fill(`Send proposal ${suffix}`);
  await page.getByRole("radio", { name: "Agency" }).check({ force: true });
  await page.getByRole("radio", { name: "Later" }).check({ force: true });
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Agency" })).toBeVisible();

  // Edit the English task: rename to Arabic
  await page.getByRole("link", { name: new RegExp(`Send proposal ${suffix}`) }).click();
  await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible();
  await page.getByLabel("Title").fill(`${ARABIC} ${suffix}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  const arabicRow = page.getByRole("listitem").filter({ hasText: ARABIC });
  expect(await arabicRow.locator("bdi").evaluate((el) => el.matches(":dir(rtl)"))).toBe(true);

  // Complete the Hebrew task with one tap: it leaves the open list
  await page.getByRole("checkbox", { name: new RegExp(`Mark done: ${HEBREW}`) }).click();
  await expect(page.getByRole("listitem").filter({ hasText: HEBREW })).toHaveCount(0);
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: HEBREW })).toBeVisible();

  // Drop the Arabic task, then find it under Dropped
  await page.goto("/tasks");
  await page.getByRole("link", { name: new RegExp(ARABIC) }).click();
  await page.getByRole("button", { name: "Drop" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.getByRole("link", { name: "Dropped" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: ARABIC })).toBeVisible();
});

test("a task needs a title", async ({ page }) => {
  await signIn(page);
  await page.goto("/tasks");
  await page.getByLabel("Add a task").fill("   ");
  await page.getByLabel("Add a task").press("Enter");
  await expect(page.getByRole("radio", { name: "Grades" })).toHaveCount(0);
});
