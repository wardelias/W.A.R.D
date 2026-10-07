import { expect, test, type Page } from "@playwright/test";
import { choose, quickAdd, resetUserData } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

async function addToday(page: Page, title: string, goal: string, time: string) {
  const input = page.getByLabel("Add a task");
  await input.fill(title);
  const form = quickAdd(page);
  await choose(form, goal);
  await choose(form, time);
  await choose(form, "Today");
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test("night check-in: log, move what slipped, set tomorrow's first task", async ({ page }) => {
  await page.goto("/habits/new");
  await page.getByLabel("Name").fill("Walk 20 min");
  await page.getByLabel("Minimum version").fill("5 min");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: /Walk 20 min/ })).toBeVisible();

  await page.goto("/today");
  await addToday(page, "Algorithms HW", "Grades", "90m");
  await addToday(page, "סיכום הרצאה", "Grades", "45m");
  await addToday(page, "Old idea", "Agency", "30m");
  await page.getByRole("checkbox", { name: "Mark done: Algorithms HW" }).click();
  await expect(page.getByRole("checkbox", { name: "Mark not done: Algorithms HW" })).toBeVisible();

  await page.goto("/shutdown");
  await expect(page.getByRole("heading", { name: /Shutdown/ })).toBeVisible();

  // Unfinished tasks default to tomorrow; drop one
  const idea = page.getByRole("listitem").filter({ hasText: "Old idea" });
  await choose(idea, "Drop");

  // Habit not logged: log the minimum right here
  await page.getByRole("button", { name: "Minimum: Walk 20 min" }).click();
  await expect(page.getByText("All of today's habits are logged.")).toBeVisible();

  // Tomorrow's first task defaults to the Grades task moving to tomorrow
  await expect(page.getByRole("radio", { name: /סיכום הרצאה/ })).toBeChecked();
  await expect(page.getByText("Tomorrow: 45m focus planned of 6h.")).toBeVisible();

  await page.getByLabel("Note").fill("Good focus in the morning.\nעייף בערב.");
  await page.getByRole("button", { name: "Close the day" }).click();

  await expect(page.getByText(/Day closed at/)).toBeVisible();
  await expect(page.getByText("Tasks: 1 done of 3 planned · 1 moved · 1 dropped")).toBeVisible();
  await expect(page.getByText("Habits: 0 full · 1 minimum · 0 missed of 1")).toBeVisible();
  await expect(page.getByText(/Tomorrow starts with:/)).toContainText("סיכום הרצאה");

  // The moved task slipped once and is tomorrow's one thing; Today shows the day as closed
  await page.goto("/tasks");
  await expect(page.getByRole("listitem").filter({ hasText: "סיכום הרצאה" })).toContainText(
    "Tomorrow · slipped 1×",
  );
  await page.goto("/today");
  await expect(page.getByRole("link", { name: "Day closed · View" })).toBeVisible();

  // Editing the check-in keeps the note
  await page.goto("/shutdown?edit=1");
  await expect(page.getByLabel("Note")).toHaveValue("Good focus in the morning.\nעייף בערב.");
});

test("a new task can be tomorrow's first task", async ({ page }) => {
  await page.goto("/shutdown");
  await page.getByRole("radio", { name: "A new task" }).check();
  await page.getByLabel("New task for tomorrow").fill("مراجعة الفصل الثالث");
  await choose(page, "Grades");
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText(/Tomorrow starts with:/)).toContainText("مراجعة الفصل الثالث");
  await page.goto("/tasks");
  await expect(page.getByRole("listitem").filter({ hasText: "مراجعة الفصل الثالث" })).toContainText(
    "Tomorrow",
  );
});
