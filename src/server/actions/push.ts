"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { run, type ActionResult } from "@/server/actions/run";
import { ServiceError } from "@/server/context";
import { sendToUser, webPushSender } from "@/server/push/sender";
import { createAdminClient } from "@/server/supabase/admin";

const subscriptionInput = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(128) }),
});

export async function savePushSubscriptionAction(subscription: unknown): Promise<ActionResult> {
  const result = await run(async (ctx) => {
    const v = subscriptionInput.safeParse(subscription);
    if (!v.success) throw new ServiceError("This browser returned an unusable subscription.");
    const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
    // An endpoint belongs to one device; re-subscribing replaces the old row.
    await ctx.db.from("push_subscriptions").delete().eq("endpoint", v.data.endpoint);
    const { error } = await ctx.db.from("push_subscriptions").insert({
      endpoint: v.data.endpoint,
      p256dh: v.data.keys.p256dh,
      auth: v.data.keys.auth,
      user_agent: ua,
    });
    if (error) throw new ServiceError("Couldn't save this device. Try again.");
  });
  return result.ok ? { ok: true } : result;
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  const result = await run(async (ctx) => {
    await ctx.db
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", z.string().max(2048).parse(endpoint));
  });
  return result.ok ? { ok: true } : result;
}

export async function setNudgePrefsAction(prefs: {
  habits: boolean;
  shutdown: boolean;
}): Promise<ActionResult> {
  const v = z.object({ habits: z.boolean(), shutdown: z.boolean() }).parse(prefs);
  const result = await run(async (ctx) => {
    const { error } = await ctx.db
      .from("settings")
      .update({ nudge_habits: v.habits, nudge_shutdown: v.shutdown })
      .eq("user_id", ctx.userId);
    if (error) throw new ServiceError("Couldn't save. Try again.");
  });
  return result.ok ? { ok: true } : result;
}

export async function sendTestPushAction(): Promise<ActionResult> {
  const result = await run(async (ctx) => {
    const send = webPushSender();
    if (!send)
      throw new ServiceError("Notifications aren't configured on the server (VAPID keys).");
    const { delivered } = await sendToUser(
      createAdminClient(),
      ctx.userId,
      {
        title: "W.A.R.D.",
        body: "Test notification. Nudges will look like this.",
        url: "/today",
        tag: "test",
        actions: [],
      },
      send,
    );
    if (!delivered)
      throw new ServiceError("No device received it. Turn notifications on for this device first.");
  });
  return result.ok ? { ok: true } : result;
}
