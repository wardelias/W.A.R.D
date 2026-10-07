import { expect, test, type Page } from "@playwright/test";
import { choose, quickAdd, resetUserData, goto } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

async function add(page: Page, title: string, goal: string, time: string, when: string) {
  const input = page.getByLabel("Add a task");
  await input.fill(title);
  const form = quickAdd(page);
  await choose(form, goal);
  await choose(form, time);
  await choose(form, when);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test("the week shows each day's load, flags overload and no-Grades days, and fixes a day", async ({
  page,
}) => {
  await goto(page, "/tasks");
  await add(page, "Thesis chapter", "Grades", "90m", "Today");
  await add(page, "Problem set", "Grades", "90m", "Today");
  await add(page, "Lab report", "Grades", "90m", "Today");
  await add(page, "Lecture review", "Grades", "90m", "Today");
  await add(page, "Client call prep", "Agency", "30m", "Today");
  await add(page, "Meal prep", "Health", "45m", "Tomorrow");

  await goto(page, "/week");
  const todayRow = page.getByRole("link", { name: /\btoday\b/ });
  await expect(todayRow).toContainText("6h 30m");
  await expect(todayRow).toContainText("over by 30m");
  const tomorrowRow = page.getByRole("link", { name: /\b45m\b/ });
  await expect(tomorrowRow).toContainText("no Grades work");

  await todayRow.click();
  await expect(page.getByText("Focus planned 6h 30m of 6h. Over by 30m.")).toBeVisible();
  // Titles are wrapped in bidi isolates (U+2068/U+2069) inside the sentence.
  await expect(
    page.getByText(/Move “\u2068?Client call prep\u2069?” \(30m\) to Tomorrow\?/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText(/Over by/)).toHaveCount(0);
  await expect(page.getByText("6h of 6h focus planned")).toBeVisible();

  await page.getByRole("link", { name: "← Week" }).click();
  await expect(page.getByRole("link", { name: /\btoday\b/ })).not.toContainText("over by");
});

test("weeks can be paged", async ({ page }) => {
  await goto(page, "/week");
  const title = await page.getByRole("heading", { level: 1 }).textContent();
  await page.getByRole("link", { name: "Next →" }).click();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(title!);
  await page.getByRole("link", { name: "This week" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
});
