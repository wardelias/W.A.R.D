import { Suspense } from "react";
import { Button, Section } from "@/components/ui";
import { signOut } from "@/server/actions/auth";
import { getContext } from "@/server/context";

export const metadata = { title: "Settings · W.A.R.D." };

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Settings</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <SettingsView />
      </Suspense>
    </>
  );
}

async function SettingsView() {
  const ctx = await getContext();
  return (
    <Section title="Account">
      <p className="text-[15px]">
        Signed in as <bdi>{ctx.email}</bdi>.
      </p>
      <form action={signOut} className="mt-3">
        <Button type="submit">Sign out</Button>
      </form>
    </Section>
  );
}
