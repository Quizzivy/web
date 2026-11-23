import { describe, expect, it } from "vitest";
import { Flag } from "lucide-react";
import i18n from "@/lib/i18n";
import { describeNotification } from "@/features/notifications/kinds";
import { FLAGGED } from "@/features/integrity/tones";
import type { Notification } from "@/features/notifications/api";
import { attemptId, listResponse, notices } from "./support";

const first = notices.find((notice) => notice.kind === "attempt.flagged")!;

describe("a repeated attempt.flagged (F1)", () => {
  // Under a flexible assignment the server writes the item again with the new count.
  const again: Notification = {
    ...first,
    params: { ...first.params, focusLost: 5 },
    createdAt: "2026-10-01T12:15:00Z",
    readAt: null,
  };

  it("validates against the contract", () => {
    expect(() => listResponse({ items: [again], nextBefore: null })).not.toThrow();
  });

  it("reads its new count, in the danger tone with the flag, and opens the attempt", () => {
    for (const [locale, text] of [
      ["vi", "Lê Hoàng Nam đã rời trang làm bài 5 lần"],
      ["en", "Lê Hoàng Nam left the test 5 times"],
    ] as const) {
      const view = describeNotification(again, i18n.getFixedT(locale), locale);
      expect(view).toEqual({
        icon: Flag,
        tone: FLAGGED.tone,
        text,
        to: `/teacher/attempts/${attemptId}`,
      });
    }
    expect(FLAGGED.tone).toBe("danger");
    expect(describeNotification(first, i18n.getFixedT("vi"), "vi")?.text).toBe(
      "Lê Hoàng Nam đã rời trang làm bài 3 lần",
    );
  });

  it("never words the absence as cheating or a violation", () => {
    for (const locale of ["vi", "en"] as const) {
      const text = describeNotification(again, i18n.getFixedT(locale), locale)?.text;
      expect(text).not.toMatch(/gian lận|vi phạm|cheat|violat/i);
    }
  });
});
