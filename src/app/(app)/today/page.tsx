import { Suspense } from "react";
import { requireViewer } from "@/server/auth";
import { signOut } from "@/server/actions/auth";
import { Button } from "@/components/ui";

export const metadata = { title: "Today · W.A.R.D." };

export default function TodayPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  const viewer = await requireViewer();
  return (
    <div>
      <h1 className="text-lg font-semibold">Today</h1>
      <p className="mt-2 text-muted">
        Signed in as <bdi>{viewer.email}</bdi>.
      </p>
      <form action={signOut} className="mt-6">
        <Button type="submit">Sign out</Button>
      </form>
    </div>
  );
}
