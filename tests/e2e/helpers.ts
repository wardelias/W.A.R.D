import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e@ward.local";

type MailSummary = { ID: string; Created: string; To: { Address: string }[] };

async function latestCode(email: string, after: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=20`);
    const body = (await res.json()) as { messages: MailSummary[] };
    const mail = body.messages.find(
      (m) => m.To.some((t) => t.Address === email) && Date.parse(m.Created) >= after - 1000,
    );
    if (mail) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json()) as {
        Text: string;
      };
      const match = full.Text.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

/** Signs in through the real email-code flow (local Supabase + Mailpit). */
export async function signIn(page: Page, email = E2E_EMAIL) {
  await page.goto("/login");
  const startedAt = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  const code = await latestCode(email, startedAt);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(today|welcome)/);
}
