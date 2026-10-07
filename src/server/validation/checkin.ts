import { z } from "zod";
import { optionalMultiline, singleLine } from "@/domain/text";
import { isoDate, uuid } from "./common";

export const taskDecision = z.discriminatedUnion("action", [
  z.object({ id: uuid, action: z.literal("done") }),
  z.object({ id: uuid, action: z.literal("drop") }),
  z.object({ id: uuid, action: z.literal("move"), toDay: isoDate }),
]);

export const closeDayInput = z.object({
  day: isoDate,
  tasks: z.array(taskDecision).max(200),
  blocks: z.array(z.object({ id: uuid, outcome: z.enum(["done", "partial", "skipped"]) })).max(50),
  firstTask: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("existing"), taskId: uuid }),
      z.object({ kind: z.literal("new"), title: singleLine(300), goalId: uuid }),
    ])
    .nullable(),
  note: optionalMultiline(5000),
});
export type CloseDayInput = z.input<typeof closeDayInput>;
