import { expect, test } from "@playwright/test";
import { E2E_EMAIL, signIn } from "./helpers";

// These tests exercise login itself, so they start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated visitors are sent to the login page", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?next=%2Ftasks/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("an email that isn't allowlisted can't request a code", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("stranger@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("This email isn't allowed to sign in.")).toBeVisible();
});

test("sign in with an email code, then sign out", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await expect(page.getByText(`Signed in as ${E2E_EMAIL}.`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});
