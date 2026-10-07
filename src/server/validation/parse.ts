import type { z } from "zod";
import { ServiceError } from "@/server/context";

/** Validates input or throws a ServiceError with the first message (safe to show). */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ServiceError(result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}
