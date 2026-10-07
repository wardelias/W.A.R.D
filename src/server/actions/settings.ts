"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE } from "@/lib/theme";
import { run, type ActionResult } from "@/server/actions/run";
import {
  completeOnboarding,
  updateGoals,
  updateSchedule,
  updateTheme,
} from "@/server/services/settings";
import type { ScheduleInput } from "@/server/validation/settings";

export async function saveScheduleAction(input: ScheduleInput): Promise<ActionResult> {
  const result = await run((ctx) => updateSchedule(ctx, input));
  return result.ok ? { ok: true } : result;
}

export async function saveGoalsAction(
  goals: { id: string; title: string; label: string }[],
): Promise<ActionResult> {
  const result = await run((ctx) => updateGoals(ctx, { goals }));
  return result.ok ? { ok: true } : result;
}

export async function saveThemeAction(theme: "system" | "light" | "dark"): Promise<ActionResult> {
  const result = await run((ctx) => updateTheme(ctx, theme));
  if (!result.ok) return result;
  const jar = await cookies();
  if (theme === "system") jar.delete(THEME_COOKIE);
  else
    jar.set(THEME_COOKIE, theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });
  return { ok: true };
}

export async function finishOnboardingAction(): Promise<void> {
  const result = await run((ctx) => completeOnboarding(ctx));
  if (result.ok) redirect("/today");
}
