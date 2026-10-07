import { Suspense } from "react";
import { GoogleSettings } from "@/components/calendar/google-settings";
import { GoalsForm } from "@/components/settings/goals-form";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { ThemeChooser } from "@/components/settings/theme-chooser";
import { listGoals } from "@/server/services/goals";
import { scheduleValues, timeZoneList } from "@/lib/settings-values";
import { Button, Notice, Section } from "@/components/ui";
import { ago } from "@/lib/relative-time";
import { signOut } from "@/server/actions/auth";
import { getContext } from "@/server/context";
import { calendarStatus } from "@/server/services/calendar";

export const metadata = { title: "Settings · W.A.R.D." };

const GOOGLE_RESULT: Record<string, string> = {
  connected: "Google Calendar connected.",
  denied: "Google Calendar wasn't connected: access was declined.",
  scopes:
    "Google Calendar needs all three calendar permissions. Connect again and keep them ticked.",
  expired: "The connection took too long. Try again.",
  failed: "Couldn't connect Google Calendar. Try again.",
};

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <h1 className="text-lg font-semibold">Settings</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <SettingsView searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SettingsView({ searchParams }: Pick<PageProps<"/settings">, "searchParams">) {
  const { google } = await searchParams;
  const ctx = await getContext();
  const [status, goals] = await Promise.all([calendarStatus(ctx), listGoals(ctx)]);
  const result = typeof google === "string" ? GOOGLE_RESULT[google] : undefined;

  return (
    <div>
      {result ? <Notice className="mt-4">{result}</Notice> : null}

      <Section title="Schedule">
        <ScheduleForm initial={scheduleValues(ctx.settings)} timeZones={timeZoneList()} />
      </Section>

      <Section title="Goal ladder">
        <GoalsForm initial={goals.map((g) => ({ id: g.id, title: g.title, label: g.label }))} />
      </Section>

      <Section title="Google Calendar">
        <GoogleSettings
          connected={Boolean(status.connection)}
          needsReconnect={status.connection?.status === "needs_reconnect"}
          email={status.connection?.email ?? null}
          lastSync={ago(status.lastSyncedAt, ctx.now)}
          calendars={status.calendars}
        />
      </Section>

      <Section title="Appearance">
        <ThemeChooser initial={ctx.settings.theme as "system" | "light" | "dark"} />
      </Section>

      <Section title="Account">
        <p className="text-[15px]">
          Signed in as <bdi>{ctx.email}</bdi>.
        </p>
        <form action={signOut} className="mt-3">
          <Button type="submit">Sign out</Button>
        </form>
      </Section>
    </div>
  );
}
