import "server-only";
import type { MoveItem } from "@/domain/capacity";
import type { IsoDate } from "@/domain/day";
import type { Ctx } from "@/server/context";
import { moveBlockToDay } from "@/server/services/blocks";
import { planTask } from "@/server/services/tasks";

/**
 * Moves one overload-fix item to another day. A task moves with its focus
 * blocks (same time of day if free there). Not counted as a slip: it's planning.
 */
export async function moveForFix(ctx: Ctx, item: MoveItem, toDay: IsoDate): Promise<void> {
  if (item.kind === "task") {
    await planTask(ctx, { id: item.taskId, day: toDay });
    for (const blockId of item.blockIds) await moveBlockToDay(ctx, blockId, toDay);
    return;
  }
  await moveBlockToDay(ctx, item.blockId, toDay);
}
