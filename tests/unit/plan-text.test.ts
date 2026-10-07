import { describe, expect, it } from "vitest";
import type { OverloadFix } from "@/domain/capacity";
import { stripIsolates } from "@/domain/text";
import { fixSentence } from "@/lib/plan-text";

const today = "2026-10-07";

describe("fixSentence", () => {
  it("names each move and the day, plainly", () => {
    const fix: OverloadFix = {
      overBy: 45,
      fixed: true,
      moves: [
        {
          item: {
            kind: "task",
            taskId: "a",
            blockIds: [],
            minutes: 30,
            goalRank: 2,
            title: "Send proposal",
          },
          toDay: "2026-10-08",
        },
        {
          item: {
            kind: "task",
            taskId: "b",
            blockIds: [],
            minutes: 45,
            goalRank: 3,
            title: "סיכום",
          },
          toDay: "2026-10-09",
        },
      ],
    };
    expect(stripIsolates(fixSentence(fix, today))).toBe(
      "Move “Send proposal” (30m) to Tomorrow and “סיכום” (45m) to Fri?",
    );
  });

  it("says when Google Calendar will change", () => {
    const fix: OverloadFix = {
      overBy: 45,
      fixed: false,
      moves: [
        {
          item: {
            kind: "task",
            taskId: "a",
            blockIds: ["x", "y"],
            minutes: 90,
            goalRank: 2,
            title: "Lab",
          },
          toDay: "2026-10-08",
        },
      ],
    };
    expect(stripIsolates(fixSentence(fix, today))).toBe(
      "Move “Lab” with its 2 focus blocks (1h 30m) to Tomorrow? This updates Google Calendar “W.A.R.D.”. Still over after that.",
    );
  });

  it("proposes dropping or shrinking when no day has room", () => {
    const fix: OverloadFix = {
      overBy: 60,
      fixed: false,
      moves: [
        {
          item: { kind: "block", blockId: "x", minutes: 60, goalRank: null, title: "Focus" },
          toDay: null,
        },
      ],
    };
    expect(fixSentence(fix, today)).toBe(
      "No day in the coming week has room. Drop or shrink something.",
    );
  });
});
