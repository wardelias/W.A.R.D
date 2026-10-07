import { expect, test } from "@playwright/test";

test("security headers are sent", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).toContain("connect-src 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("same-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("no CSP violations on the main screens", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text()))
      violations.push(m.text());
  });
  for (const path of ["/today", "/tasks", "/habits", "/week", "/settings", "/shutdown"]) {
    await page.goto(path);
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
  }
  expect(violations).toEqual([]);
});
