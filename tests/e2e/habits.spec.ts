import { expect, test } from "@playwright/test";
import { choose, goto } from "./helpers";

test("create a habit, log it full or minimum with one tap, see honest stats, archive it", async ({
  page,
}) => {
  const name = `קריאה ${Date.now().toString(36)}`;
  await goto(page, "/habits");
  await page.getByRole("link", { name: "+ New" }).click();

  await page.getByLabel("Name").fill(name);
  await choose(page, "Grades");
  // The minimum version is required
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Minimum version")).toBeFocused();
  await page.getByLabel("Minimum version").fill("עמוד אחד");
  await page.getByRole("button", { name: "Save" }).click();

  // Detail page
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByText("0 full · 0 minimum · 0 missed")).toBeVisible();

  // One tap: Done, then undo, then minimum
  await goto(page, "/habits");
  const row = page.getByRole("listitem").filter({ hasText: name }).first();
  await row.getByRole("button", { name: `Done: ${name}` }).click();
  await expect(row).toContainText("full");
  await row.getByRole("button", { name: `Undo ${name}` }).click();
  await expect(row.getByRole("button", { name: `Minimum: ${name}` })).toBeVisible();
  await row.getByRole("button", { name: `Minimum: ${name}` }).click();
  await expect(row).toContainText("minimum");

  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: name }).first()).toContainText(
    "minimum",
  );

  // Detail reflects it honestly
  await page
    .getByRole("link", { name: new RegExp(name) })
    .last()
    .click();
  await expect(page.getByText(/0 full · 1 minimum · 0 missed · of 1 scheduled/)).toBeVisible();

  // Edit to strict, then archive
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel(/Strict/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Strict: any miss resets")).toBeVisible();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/habits$/);
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  await goto(page, "/habits?view=archived");
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
});

test("a days habit needs at least one day", async ({ page }) => {
  await goto(page, "/habits/new");
  await page.getByLabel("Name").fill("Gym");
  await page.getByLabel("Minimum version").fill("10 push-ups");
  await choose(page, "Days");
  for (const d of ["Sun", "Mon", "Tue", "Wed", "Thu"]) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Pick at least one day.")).toBeVisible();
});
