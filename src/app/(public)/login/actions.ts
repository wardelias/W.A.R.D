"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { isAllowedEmail, safeNextPath } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { createClient } from "@/server/supabase/server";

export type LoginState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string };

const emailSchema = z.email().max(254);
const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

/** One action for both login steps, so the form keeps a single state. */
export async function loginStep(prev: LoginState, formData: FormData): Promise<LoginState> {
  return formData.get("intent") === "verify" ? verifyCode(formData) : sendCode(formData);
}

async function sendCode(formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { step: "email", email: raw, error: "Enter a valid email." };
  if (!isAllowedEmail(parsed.data, serverEnv().ALLOWED_EMAILS)) {
    return { step: "email", email: raw, error: "This email isn't allowed to sign in." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: true },
  });
  if (error) {
    const waiting = error.status === 429;
    return {
      step: "email",
      email: raw,
      error: waiting
        ? "Too many codes requested. Wait a minute and try again."
        : "Couldn't send the code. Try again.",
    };
  }
  return { step: "code", email: parsed.data };
}

async function verifyCode(formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? "")).data ?? "";
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const parsed = codeSchema.safeParse(token);
  if (!email) return { step: "email", error: "Start again with your email." };
  if (!parsed.success) return { step: "code", email, error: "Enter the 6-digit code." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: parsed.data, type: "email" });
  if (error)
    return { step: "code", email, error: "That code didn't work. Check it or request a new one." };

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const callback = new URL("/auth/callback", publicEnv().NEXT_PUBLIC_APP_URL);
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}
