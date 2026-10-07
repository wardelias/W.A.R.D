import { describe, expect, it } from "vitest";
import { isAllowedEmail, safeNextPath } from "@/server/auth";

describe("isAllowedEmail", () => {
  const list = ["me@example.com"];
  it("matches case-insensitively and ignores surrounding spaces", () => {
    expect(isAllowedEmail(" Me@Example.com ", list)).toBe(true);
  });
  it("rejects other and missing emails", () => {
    expect(isAllowedEmail("other@example.com", list)).toBe(false);
    expect(isAllowedEmail(undefined, list)).toBe(false);
    expect(isAllowedEmail("", list)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/tasks?x=1")).toBe("/tasks?x=1");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "tasks", "", null])(
    "falls back for %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/today");
    },
  );
});
