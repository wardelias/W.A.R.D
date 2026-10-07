import "server-only";
import type { MoveItem } from "@/domain/capacity";
import type { IsoDate } from "@/domain/day";
import { ServiceError, type Ctx } from "@/server/context";
import { planTask } from "@/server/services/tasks";

/** Moves one overload-fix item to another day. Not counted as a slip: it's planning. */
export async function moveForFix(ctx: Ctx, item: MoveItem, toDay: IsoDate): Promise<void> {
  if (item.kind === "task") {
    if (item.blockIds.length > 0) {
      throw new ServiceError("Move this task's focus blocks from the calendar.");
    }
    await planTask(ctx, { id: item.taskId, day: toDay });
    return;
  }
  throw new ServiceError("Move this focus block from the calendar.");
}
