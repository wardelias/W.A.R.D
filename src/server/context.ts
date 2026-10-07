import "server-only";
import { cache } from "react";
import { logicalDay, type IsoDate } from "@/domain/day";
import type { FocusWindow } from "@/domain/slots";
import { requireViewer } from "@/server/auth";
import { createClient, type UserClient } from "@/server/supabase/server";
import type { Tables } from "@/server/supabase/database.types";

export type SettingsRow = Tables<"settings">;

export type Settings = Omit<SettingsRow, "focus_windows"> & { focus_windows: FocusWindow[] };

/**
 * Everything a service needs for one request: the user's database client
 * (row-level security applies), their settings, and "now"/"today" in their
 * time zone with the day rollover applied.
 */
export type Ctx = {
  db: UserClient;
  userId: string;
  email: string;
  settings: Settings;
  now: Date;
  today: IsoDate;
};

export class ServiceError extends Error {
  /** A message safe to show the user. */
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export function parseFocusWindows(value: unknown): FocusWindow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (w): w is FocusWindow =>
      typeof w === "object" &&
      w !== null &&
      typeof w.start === "string" &&
      typeof w.end === "string",
  );
}

export const getContext = cache(async (): Promise<Ctx> => {
  const viewer = await requireViewer();
  const db = await createClient();
  const { data, error } = await db.from("settings").select("*").eq("user_id", viewer.id).single();
  if (error || !data) throw new Error("Settings row missing for user");
  const settings: Settings = { ...data, focus_windows: parseFocusWindows(data.focus_windows) };
  const now = new Date();
  return {
    db,
    userId: viewer.id,
    email: viewer.email,
    settings,
    now,
    today: logicalDay(now, settings.timezone, settings.day_rollover),
  };
});

/** Throws a ServiceError for a failed query, without leaking internals. */
export function check<T>(
  result: { data: T; error: { message: string; code?: string } | null },
  what: string,
): T {
  if (result.error) {
    console.error(`[db] ${what} failed`, result.error.code ?? "", result.error.message);
    throw new ServiceError(`Couldn't ${what}. Try again.`);
  }
  return result.data;
}
