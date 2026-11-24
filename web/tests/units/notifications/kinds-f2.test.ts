import { describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import { describeNotification, notificationPath } from "@/features/notifications/kinds";
import type { Notification } from "@/features/notifications/api";
import { id, studentId } from "./support";

const colleagueId = id(1031);

/** A colleague's message as the bell lists it (F2): no class, the target names the colleague. */
const fromColleague: Notification = {
  id: id(1032),
  kind: "message.received",
  params: { senderName: "Phan Minh Đức", count: 1, excerpt: "Em gửi chị bộ thẻ gợi ý" },
  target: { route: "messages", colleagueId },
  createdAt: "2026-11-16T13:05:00Z",
  readAt: null,
};

describe("a colleague's message in the bell (T-F2.7)", () => {
  it("opens the colleague thread", () => {
    expect(notificationPath({ route: "messages", colleagueId })).toBe(
      `/teacher/messages/colleagues/${colleagueId}`,
    );
    const row = describeNotification(fromColleague, i18n.getFixedT("vi"), "vi");
    expect(row?.to).toBe(`/teacher/messages/colleagues/${colleagueId}`);
    expect(row?.text).toContain("Phan Minh Đức");
  });

  it("still opens a student's thread by `studentId`", () => {
    expect(notificationPath({ route: "messages", studentId })).toBe(
      `/teacher/messages/student/${studentId}`,
    );
  });

  it("refuses a malformed colleague id rather than build a path from it", () => {
    for (const value of ["", "..", "a/b", "https://evil.example", "id?redirect=x"])
      expect(notificationPath({ route: "messages", colleagueId: value })).toBeNull();
  });
});
