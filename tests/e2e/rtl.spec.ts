import { expect, test } from "@playwright/test";
import { goto, resetUserData } from "./helpers";

test.beforeEach(async () => {
  await resetUserData();
});

test("every free-text field on the main screens takes its direction from its content", async ({
  page,
}) => {
  // A task to open its edit page
  await goto(page, "/tasks");
  await page.getByLabel("Add a task").fill("טקסט בעברית with English");
  await page.getByLabel("Add a task").press("Enter");
  await expect(page.getByLabel("Add a task")).toHaveValue("");
  await page.getByRole("link", { name: /טקסט בעברית/ }).click();
  await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible();
  const taskPath = new URL(page.url()).pathname;

  for (const path of ["/today", "/tasks", taskPath, "/habits/new", "/shutdown", "/settings"]) {
    await goto(page, path);
    const offenders = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "main input, main textarea",
        ),
      )
        .filter((el) => el.offsetParent !== null)
        .filter((el) => el.tagName === "TEXTAREA" || el.type === "text" || el.type === "search")
        .filter((el) => el.getAttribute("dir") !== "auto")
        .map(
          (el) => el.id || el.name || el.getAttribute("aria-label") || el.outerHTML.slice(0, 80),
        ),
    );
    expect(offenders, `fields without dir="auto" on ${path}`).toEqual([]);
  }
});

test("a multi-line note keeps each line in its own direction", async ({ page }) => {
  await goto(page, "/shutdown");
  const note = "Good focus today.\nעייף בערב.\nغدا أبدأ مبكرا.";
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Close the day" }).click();
  const paragraph = page.locator("p.bidi-plain");
  await expect(paragraph).toHaveText(note.replace(/\n/g, "\n"));
  expect(await paragraph.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe("plaintext");
  expect(await paragraph.getAttribute("dir")).toBe("auto");
});
