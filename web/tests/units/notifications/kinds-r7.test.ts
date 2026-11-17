import { describe, expect, it } from "vitest";
import { FileText, LayoutDashboard, MessageSquare, UsersRound } from "lucide-react";
import i18n from "@/lib/i18n";
import { loadSpec } from "@tests/support/openapi";
import {
  audienceOf,
  describeNotification,
  notificationPath,
} from "@/features/notifications/kinds";
import type {
  Notification,
  NotificationParams,
  NotificationTarget,
} from "@/features/notifications/api";
import {
  assignmentId,
  attemptId,
  classId,
  collaborationNotices,
  listResponse,
  studentId,
  teacherId,
  testId,
} from "./support";

const [
  sharedTest,
  sharedSet,
  published,
  fromStudent,
  fromTeacher,
  announcement,
  weekly,
] = collaborationNotices as [
  Notification,
  Notification,
  Notification,
  Notification,
  Notification,
  Notification,
  Notification,
];

const expected = [
  [
    sharedTest,
    "Phan Minh Đức đã chia sẻ đề thi Mid-term Reading Mock với bạn",
    "Phan Minh Đức shared the test Mid-term Reading Mock with you",
    UsersRound,
    "info",
    "/teacher/shared-with-me",
    "teacher",
  ],
  [
    sharedSet,
    "Phan Minh Đức đã chia sẻ bộ câu hỏi Collocations · B1 với bạn",
    "Phan Minh Đức shared the question set Collocations · B1 with you",
    UsersRound,
    "info",
    "/teacher/shared-with-me",
    "teacher",
  ],
  [
    published,
    "Lý Thanh Vân đã phát hành phiên bản 4 của Mid-term Reading Mock",
    "Lý Thanh Vân published version 4 of Mid-term Reading Mock",
    FileText,
    "info",
    `/teacher/tests/${testId}`,
    "teacher",
  ],
  [
    fromStudent,
    "2 tin nhắn mới từ Trần Minh Anh: “Em nộp lại bài được không ạ?”",
    "2 new messages from Trần Minh Anh: “Em nộp lại bài được không ạ?”",
    MessageSquare,
    "info",
    `/teacher/messages/student/${studentId}`,
    "teacher",
  ],
  [
    fromTeacher,
    "Giàu Bùi: “Nhớ ôn Unit 4 nhé”",
    "Giàu Bùi: “Nhớ ôn Unit 4 nhé”",
    MessageSquare,
    "neutral",
    `/messages/teacher/${teacherId}`,
    "student",
  ],
  [
    announcement,
    "3 thông báo lớp mới ở IELTS 6.5 Evening · Giàu Bùi: “Lớp tối nay nghỉ”",
    "3 new announcements in IELTS 6.5 Evening · Giàu Bùi: “Lớp tối nay nghỉ”",
    MessageSquare,
    "neutral",
    `/messages/class/${classId}`,
    "student",
  ],
  [
    weekly,
    "Tuần qua: 41 bài nộp, 6 bài chờ chấm, 2 lượt bị gắn cờ",
    "Last week: 41 papers handed in, 6 to grade, 2 flagged",
    LayoutDashboard,
    "neutral",
    "/teacher",
    "teacher",
  ],
] as const;

function words(notice: Notification, locale: "vi" | "en") {
  return describeNotification(notice, i18n.getFixedT(locale), locale);
}

describe("R7's notification kinds (T-R7.23)", () => {
  it("validate against the contract", () => {
    expect(() =>
      listResponse({ items: collaborationNotices, nextBefore: null }),
    ).not.toThrow();
  });

  it.each(expected.map((row) => ({ kind: row[0].kind, row })))(
    "words $kind in both languages, with its look, its route and its bell",
    ({ row }) => {
      const [notice, vi, en, icon, tone, to, audience] = row;
      expect(words(notice, "vi")).toEqual({ icon, tone, text: vi, to });
      expect(words(notice, "en")).toEqual({ icon, tone, text: en, to });
      expect(audienceOf(notice.kind)).toBe(audience);
    },
  );

  it("words one message as the Student deck's bell does, and counts only many", () => {
    const one = { ...fromStudent, params: { ...fromStudent.params, count: 1 } };
    expect(words(one, "en")?.text).toBe(
      "Trần Minh Anh: “Em nộp lại bài được không ạ?”",
    );
    expect(words(one, "vi")?.text).toBe(
      "Trần Minh Anh: “Em nộp lại bài được không ạ?”",
    );
    const single = { ...announcement, params: { ...announcement.params, count: 1 } };
    expect(words(single, "en")?.text).toBe(
      "New announcement in IELTS 6.5 Evening · Giàu Bùi: “Lớp tối nay nghỉ”",
    );
    expect(words(single, "vi")?.text).toBe(
      "Thông báo lớp mới ở IELTS 6.5 Evening · Giàu Bùi: “Lớp tối nay nghỉ”",
    );
    const quiet = { ...weekly, params: { ...weekly.params, count: 1 } };
    expect(words(quiet, "en")?.text).toBe(
      "Last week: 1 paper handed in, 6 to grade, 2 flagged",
    );
  });

  it("keeps a name or an excerpt with markup or braces as the text it is", () => {
    const odd = {
      ...fromStudent,
      params: { ...fromStudent.params, excerpt: "<b>{{count}}</b> $& ạ" },
    };
    expect(words(odd, "en")?.text).toBe(
      "2 new messages from Trần Minh Anh: “<b>{{count}}</b> $& ạ”",
    );
  });

  it.each([
    [sharedTest, "sharerName"],
    [sharedTest, "name"],
    [sharedTest, "contentKind"],
    [published, "editorName"],
    [published, "title"],
    [published, "version"],
    [fromStudent, "senderName"],
    [fromStudent, "excerpt"],
    [fromStudent, "count"],
    [weekly, "count"],
    [weekly, "toGrade"],
    [weekly, "flagged"],
  ] as const)("skips $0.kind when %s is missing", (notice, field) => {
    const params: NotificationParams = { ...notice.params };
    delete params[field];
    expect(words({ ...notice, params }, "vi")).toBeNull();
  });

  it("skips a share of a kind this release does not know, a version 0 and a message count of 0", () => {
    expect(
      words(
        {
          ...sharedTest,
          params: { ...sharedTest.params, contentKind: "course" },
        } as unknown as Notification,
        "en",
      ),
    ).toBeNull();
    expect(
      words({ ...published, params: { ...published.params, version: 0 } }, "en"),
    ).toBeNull();
    expect(
      words({ ...fromStudent, params: { ...fromStudent.params, count: 0 } }, "en"),
    ).toBeNull();
    expect(
      words(
        { ...announcement, params: { ...announcement.params, className: "" } },
        "en",
      ),
    ).toBeNull();
  });
});

describe("every route a notification may name", () => {
  const ids = { assignmentId, attemptId, testId, studentId, teacherId, classId };
  const paths: Record<string, string> = {
    assignment: `/teacher/assignments/${assignmentId}`,
    attempt: `/teacher/attempts/${attemptId}`,
    grading: "/teacher/grading",
    classes: "/teacher/classes",
    result: `/attempts/${attemptId}/result`,
    studentAssignment: `/assignments/${assignmentId}`,
    sharedWithMe: "/teacher/shared-with-me",
    test: `/teacher/tests/${testId}`,
    messages: `/teacher/messages/student/${studentId}`,
    // A class wins over a teacher when a target names both.
    studentMessages: `/messages/class/${classId}`,
    dashboard: "/teacher",
  };

  it("has a page for each of the contract's routes", () => {
    const routes = loadSpec().components.schemas.NotificationTarget.properties.route
      .enum as string[];
    expect(new Set(Object.keys(paths))).toEqual(new Set(routes));
    for (const route of routes)
      expect(notificationPath({ route, ...ids } as NotificationTarget)).toBe(
        paths[route],
      );
  });

  it("opens Messages itself when a message target names no thread", () => {
    expect(notificationPath({ route: "messages" })).toBe("/teacher/messages");
    expect(notificationPath({ route: "studentMessages" })).toBe("/messages");
    expect(notificationPath({ route: "studentMessages", teacherId })).toBe(
      `/messages/teacher/${teacherId}`,
    );
  });

  it("refuses a malformed identifier rather than build a path from it", () => {
    for (const value of ["", "..", "a/b", "https://evil.example", "id?redirect=x"]) {
      expect(notificationPath({ route: "test", testId: value })).toBeNull();
      expect(notificationPath({ route: "messages", studentId: value })).toBeNull();
      expect(notificationPath({ route: "studentMessages", classId: value })).toBeNull();
      expect(
        notificationPath({ route: "studentMessages", teacherId: value }),
      ).toBeNull();
    }
    expect(notificationPath({ route: "test" })).toBeNull();
  });
});
