import "server-only";
import { check, type Ctx } from "@/server/context";

export type Goal = { id: string; rank: number; title: string; label: string };

export async function listGoals(ctx: Ctx): Promise<Goal[]> {
  const data = check(
    await ctx.db.from("goals").select("id, rank, title, label").order("rank"),
    "load your goals",
  );
  return data ?? [];
}
