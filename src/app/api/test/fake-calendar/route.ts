import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewer } from "@/server/auth";
import { getConnection } from "@/server/google/accounts";
import { fakeGoogleSide, fakeProvider, resetFakeCalendar } from "@/server/google/fake-provider";
import { createAdminClient } from "@/server/supabase/admin";

/**
 * TEST ONLY. Changes the in-memory fake calendar "on Google's side" so E2E
 * tests can check two-way sync. Exists only when CALENDAR_PROVIDER=fake and
 * E2E_TEST_ROUTES=1; otherwise it answers 404.
 */
function enabled() {
  return process.env.CALENDAR_PROVIDER === "fake" && process.env.E2E_TEST_ROUTES === "1";
}

const body = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    calendar: z.enum(["primary", "ward"]),
    summary: z.string(),
    start: z.string(),
    end: z.string(),
  }),
  z.object({ op: z.literal("move"), eventId: z.string(), start: z.string(), end: z.string() }),
  z.object({ op: z.literal("delete"), eventId: z.string() }),
  z.object({ op: z.literal("list") }),
  z.object({ op: z.literal("reset") }),
]);

export async function POST(request: NextRequest) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const input = body.parse(await request.json());
  if (input.op === "reset") {
    resetFakeCalendar();
    return NextResponse.json({ ok: true });
  }
  const connection = await getConnection(createAdminClient(), viewer.id);
  const ward = connection?.wardCalendarId;
  if (!ward) return NextResponse.json({ error: "not connected" }, { status: 400 });
  const owner = viewer.id;

  switch (input.op) {
    case "add": {
      const calendarId = input.calendar === "ward" ? ward : `primary-${owner}`;
      const event = await fakeGoogleSide.addEvent(owner, calendarId, {
        status: "confirmed",
        summary: input.summary,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
      });
      return NextResponse.json(event);
    }
    case "move":
      return NextResponse.json(
        await fakeGoogleSide.moveEvent(owner, ward, input.eventId, input.start, input.end),
      );
    case "delete":
      await fakeGoogleSide.deleteEvent(owner, ward, input.eventId);
      return NextResponse.json({ ok: true });
    case "list": {
      const range = {
        timeMin: new Date(Date.now() - 30 * 86_400_000),
        timeMax: new Date(Date.now() + 90 * 86_400_000),
      };
      return NextResponse.json({
        ward: await fakeProvider.listEvents(owner, ward, range),
        primary: await fakeProvider.listEvents(owner, `primary-${owner}`, range),
      });
    }
  }
}
