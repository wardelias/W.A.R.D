import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { getContext, ServiceError } from "@/server/context";
import { logHabit } from "@/server/services/habits";

/**
 * Called by the service worker when a notification action ("Done",
 * "Minimum") is tapped. Same-origin only; needs the signed-in session.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(publicEnv().NEXT_PUBLIC_APP_URL).origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = z
    .object({ habitId: z.uuid(), level: z.enum(["full", "minimum"]), day: z.string().optional() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    const ctx = await getContext();
    await logHabit(ctx, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e && typeof e === "object" && "digest" in e)
      return NextResponse.json({ error: "sign in" }, { status: 401 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
