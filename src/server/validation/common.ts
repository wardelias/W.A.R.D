import { z } from "zod";
import { isValidTimeZone } from "@/domain/day";

export const uuid = z.uuid();

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Not a real date.");

export const wallTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM.")
  .transform((s) => s.slice(0, 5));

export const timeZone = z.string().max(64).refine(isValidTimeZone, "Unknown time zone.");

/** Empty form values become null. */
export const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyToNull, z.coerce.number().int().min(min).max(max).nullable());
