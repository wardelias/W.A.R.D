export const metadata = { title: "Offline · W.A.R.D." };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-lg font-semibold">You&rsquo;re offline</h1>
      <p className="mt-2 text-muted">
        W.A.R.D. needs a connection to load and save. Nothing you already saved is lost.
      </p>
    </main>
  );
}
