import { test as setup } from "@playwright/test";
import { setOnboarded, signIn, STORAGE_STATE } from "./helpers";

// Sign in once through the real email-code flow; other tests reuse the session.
setup("sign in", async ({ page }) => {
  await signIn(page);
  // Other tests start past first-run setup; welcome.spec tests it explicitly.
  await setOnboarded(true);
  await page.context().storageState({ path: STORAGE_STATE });
});
