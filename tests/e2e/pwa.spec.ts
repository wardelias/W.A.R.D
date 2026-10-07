import { expect, test } from "@playwright/test";

test("the app is installable: manifest, icons and service worker", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/today");

  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.headers()["content-type"]).toContain("image/png");
  }

  await page.goto("/login");
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  expect(registered).toBe(true);
});

test("the offline page is reachable without signing in", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
});
