import { test as setup } from "@playwright/test";
import { signIn, STORAGE_STATE } from "./helpers";

// Sign in once through the real email-code flow; other tests reuse the session.
setup("sign in", async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: STORAGE_STATE });
});
