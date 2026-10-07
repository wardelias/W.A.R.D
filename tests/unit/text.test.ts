import { describe, expect, it } from "vitest";
import {
  charLength,
  isolate,
  normalizeMultiline,
  normalizeSingleLine,
  optionalMultiline,
  singleLine,
  stripIsolates,
} from "@/domain/text";

describe("normalization", () => {
  it("normalizes to NFC (Hebrew with combining points compares equal)", () => {
    // "שׁ" as shin + shin dot vs. the precomposed form
    const decomposed = "שׁ";
    const composed = "שׁ";
    expect(normalizeSingleLine(decomposed)).toBe(decomposed.normalize("NFC"));
    expect(normalizeSingleLine(composed)).toBe(composed.normalize("NFC"));
  });

  it("drops control characters but keeps newlines in multi-line text", () => {
    expect(normalizeMultiline("a\u0000b\r\nc\u0007")).toBe("ab\nc");
  });

  it("single-line fields fold newlines and tabs into spaces", () => {
    expect(normalizeSingleLine("  Read\n\tchapter  4 ")).toBe("Read chapter 4");
  });

  it("keeps bidi marks", () => {
    const withRlm = "מחיר‏ 20$";
    expect(normalizeSingleLine(withRlm)).toBe(withRlm);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(charLength("𝐀")).toBe(1);
    expect(charLength("مرحبا")).toBe(5);
  });
});

describe("isolate", () => {
  it("wraps text in FSI/PDI and can strip them again", () => {
    const wrapped = `Focus · ${isolate("סיכום הרצאה 4")}`;
    expect(wrapped).toBe("Focus · ⁨סיכום הרצאה 4⁩");
    expect(stripIsolates(wrapped)).toBe("Focus · סיכום הרצאה 4");
  });
});

describe("zod helpers", () => {
  it("singleLine trims, validates and limits by code points", () => {
    const schema = singleLine(5);
    expect(schema.parse("  שלום ")).toBe("שלום");
    expect(schema.safeParse("   ").success).toBe(false);
    expect(schema.safeParse("مرحبا بك").success).toBe(false);
    expect(schema.safeParse("مرحبا").success).toBe(true);
  });

  it("optionalMultiline turns blank into null and keeps mixed-language paragraphs", () => {
    const schema = optionalMultiline(100);
    expect(schema.parse("   ")).toBeNull();
    expect(schema.parse(undefined)).toBeNull();
    expect(schema.parse("Call the clinic\nלהתקשר מחר\nاتصل غدا")).toBe(
      "Call the clinic\nלהתקשר מחר\nاتصل غدا",
    );
  });
});
