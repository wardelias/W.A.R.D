import { expect, test, type Page } from "@playwright/test";
import { choose, quickAdd, resetUserData } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

async function addTask(page: Page, title: string, goal: string, time: string, when = "Today") {
  const input = page.getByLabel("Add a task");
  await input.fill(title);
  const form = quickAdd(page);
  await choose(form, goal);
  await choose(form, time);
  await choose(form, when);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test("plan the day: one thing, top 3, overload warning with a one-tap fix", async ({ page }) => {
  const s = Date.now().toString(36);
  await page.goto("/today");
  await expect(page.getByText("Nothing planned for today yet.")).toBeVisible();

  await addTask(page, `Algorithms HW ${s}`, "Grades", "90m");
  await addTask(page, `סיכום הרצאה ${s}`, "Grades", "90m");
  await addTask(page, `Proposal ${s}`, "Agency", "90m");
  await addTask(page, `Meal prep ${s}`, "Health", "90m");
  await addTask(page, `Clinic follow-up ${s}`, "Agency", "90m");

  // Top 3 shows three; the rest are counted
  await expect(page.getByText("2 more planned today")).toBeVisible();

  // 7h 30m planned vs 6h capacity: over by 1h 30m, and the fix moves the lowest ladder first
  const check = page.getByRole("status").filter({ hasText: "Over by" });
  await expect(check).toContainText("Focus planned 7h 30m of 6h. Over by 1h 30m.");
  await expect(check).toContainText(`Meal prep ${s}`);
  await check.getByRole("button", { name: "Move" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Over by" })).toHaveCount(0);
  await expect(page.getByText("6h of 6h")).toBeVisible();

  // Pick the one thing with one tap
  await page.getByRole("button", { name: new RegExp(`Algorithms HW ${s}`) }).click();
  const oneThing = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "One thing" }) });
  await expect(oneThing).toContainText(`Algorithms HW ${s}`);
  await expect(oneThing.getByRole("button", { name: "Change" })).toBeVisible();

  // Check off a top-3 task in one tap
  await page.getByRole("checkbox", { name: new RegExp(`Mark done: Algorithms HW ${s}`) }).click();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(`Mark not done: Algorithms HW ${s}`) }),
  ).toBeVisible();
  await expect(oneThing).toContainText("Done. Pick the next");
});
