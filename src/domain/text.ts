import { z } from "zod";

/**
 * Multilingual text rules (plan §5.5).
 * - Normalize to NFC so the same Hebrew/Arabic text always compares equal.
 * - Reject C0 control characters except newline and tab (single-line fields drop those too).
 * - Keep bidi marks (LRM U+200E, RLM U+200F, ALM U+061C): they are legitimate in Hebrew and Arabic.
 * - Length limits count code points, matching Postgres char_length().
 */

const C0_EXCEPT_NL_TAB = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function charLength(s: string): number {
  return [...s].length;
}

export function normalizeMultiline(s: string): string {
  return s.normalize("NFC").replace(/\r\n?/g, "\n").replace(C0_EXCEPT_NL_TAB, "").trim();
}

export function normalizeSingleLine(s: string): string {
  return normalizeMultiline(s)
    .replace(/[\n\t]+/g, " ")
    .replace(/ {2,}/g, " ");
}

/** First Strong Isolate … Pop Directional Isolate. */
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/**
 * Wraps user text so it keeps its own direction inside a fixed-direction
 * string, e.g. a Google Calendar title "Focus · <FSI>סיכום הרצאה 4<PDI>".
 */
export function isolate(s: string): string {
  return `${FSI}${s}${PDI}`;
}

/** Removes isolates added by `isolate` (when reading titles back from Google). */
export function stripIsolates(s: string): string {
  return s.replace(/[\u2066-\u2069]/g, "");
}

/** zod: a required single-line text field with a code-point length limit. */
export function singleLine(max: number, min = 1) {
  return z
    .string()
    .transform(normalizeSingleLine)
    .refine((s) => charLength(s) >= min, {
      message: min === 1 ? "Required." : `At least ${min} characters.`,
    })
    .refine((s) => charLength(s) <= max, { message: `At most ${max} characters.` });
}

/** zod: optional multi-line text; empty becomes null. */
export function optionalMultiline(max: number) {
  return z
    .string()
    .optional()
    .nullable()
    .transform((s) => (s == null ? null : normalizeMultiline(s) || null))
    .refine((s) => s === null || charLength(s) <= max, { message: `At most ${max} characters.` });
}
