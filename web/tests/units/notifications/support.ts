import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { HttpResponse } from "msw";
import { contractJson } from "@tests/support/contractResponse";
import { notificationDefaults } from "@tests/support/fixtures";
import type {
  Notification,
  NotificationPreference,
  NotificationPage,
} from "@/features/notifications/api";

export const BASE = "http://localhost:8080";
export function id(n: number) {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
export const assignmentId = id(1001);
export const attemptId = id(1002);
export const title = "Mid-term Reading Mock";
export const closesAt = "2026-10-01T23:30:00Z";
export const notices: Notification[] = [
  {
    kind: "attempt.submitted",
    params: { title, count: 8, toGrade: 6 },
    target: { route: "assignment", assignmentId },
  },
  {
    kind: "attempt.flagged",
    params: { title, studentName: "Lê Hoàng Nam", focusLost: 3 },
    target: { route: "attempt", attemptId },
  },
  {
    kind: "assignment.closing",
    params: { title, notSubmitted: 4 },
    target: { route: "assignment", assignmentId },
  },
  {
    kind: "class.joined",
    params: { studentName: "Nguyễn Gia Bảo", className: "IELTS Foundation A" },
    target: { route: "classes" },
  },
  {
    kind: "join_codes.rotated",
    params: {
      count: 7,
      classNames: [
        "IELTS Foundation A",
        "IELTS 6.5 Evening",
        "IELTS 7.0 Morning",
        "Reading A",
        "Listening B",
      ],
    },
    target: { route: "classes" },
  },
  {
    kind: "assignment.opened",
    params: { title, closesAt },
    target: { route: "studentAssignment", assignmentId },
  },
  {
    kind: "assignment.due_soon",
    params: { title: "Reading test", closesAt },
    target: { route: "studentAssignment", assignmentId },
  },
  {
    kind: "assignment.extended",
    params: { title, closesAt },
    target: { route: "studentAssignment", assignmentId },
  },
  {
    kind: "result.ready",
    params: { title: "Unit 3 grammar check" },
    target: { route: "result", attemptId },
  },
].map((row, index) => ({
  ...row,
  id: id(index + 1),
  createdAt: "2026-10-01T12:00:00Z",
  readAt: null,
})) as Notification[];
export const aiNotices: Notification[] = [
  {
    kind: "ai.allowance_warning",
    params: { used: 16_500, allowance: 20_000 },
    target: null,
  },
  {
    kind: "ai.credit_request",
    params: { teacherName: "Nguyễn Thị Lan", credits: 20_000 },
    target: null,
  },
  {
    kind: "ai.credit_request.decided",
    params: { credits: 20_000, decision: "approved" },
    target: null,
  },
  {
    kind: "ai.credit_request.decided",
    params: { credits: 5_000, decision: "declined" },
    target: null,
  },
].map((row, index) => ({
  ...row,
  id: id(index + 101),
  createdAt: "2026-10-01T12:00:00Z",
  readAt: null,
})) as Notification[];
export const transferNotice = {
  kind: "content.transferred",
  params: { teacherName: "Nguyễn Thị Lan", count: 42 },
  target: { route: "classes" },
  id: id(201),
  createdAt: "2026-10-01T12:00:00Z",
  readAt: null,
} as Notification;
export const testId = id(1003);
export const studentId = id(1004);
export const teacherId = id(1005);
export const classId = id(1006);
/**
 * collaborationNotices are R7's kinds (T-R7.23), each with the params and
 * the target its producer writes: a share, a co-editor's publish, a
 * student's direct message, a teacher's direct message and a class
 * announcement for a student, and the Monday summary.
 */
export const collaborationNotices: Notification[] = [
  {
    kind: "content.shared",
    params: {
      sharerName: "Phan Minh Đức",
      contentKind: "test",
      name: "Mid-term Reading Mock",
      access: "edit",
      message: "Dùng cho lớp tối nhé",
    },
    target: { route: "sharedWithMe" },
  },
  {
    kind: "content.shared",
    params: {
      sharerName: "Phan Minh Đức",
      contentKind: "question_set",
      name: "Collocations · B1",
      access: "use",
    },
    target: { route: "sharedWithMe" },
  },
  {
    kind: "test.published_by_collaborator",
    params: { editorName: "Lý Thanh Vân", title, version: 4 },
    target: { route: "test", testId },
  },
  {
    kind: "message.received",
    params: {
      senderName: "Trần Minh Anh",
      count: 2,
      excerpt: "Em nộp lại bài được không ạ?",
    },
    target: { route: "messages", studentId },
  },
  {
    kind: "message.from_teacher",
    params: { senderName: "Giàu Bùi", count: 1, excerpt: "Nhớ ôn Unit 4 nhé" },
    target: { route: "studentMessages", teacherId },
  },
  {
    kind: "message.from_teacher",
    params: {
      senderName: "Giàu Bùi",
      count: 3,
      excerpt: "Lớp tối nay nghỉ",
      className: "IELTS 6.5 Evening",
    },
    target: { route: "studentMessages", classId },
  },
  {
    kind: "summary.weekly",
    params: {
      count: 41,
      toGrade: 6,
      flagged: 2,
      classNames: ["IELTS 6.5 Evening", "IELTS Foundation A"],
    },
    target: { route: "dashboard" },
  },
].map((row, index) => ({
  ...row,
  id: id(index + 301),
  createdAt: "2026-11-16T01:00:00Z",
  readAt: null,
})) as Notification[];
export const preferences: NotificationPreference[] = notificationDefaults.map(
  (row) => ({ ...row }),
);
export const page: NotificationPage = {
  items: Array.from({ length: 20 }, (_, index) => ({
    ...notices[index % notices.length]!,
    id: id(index + 1),
  })),
  nextBefore: id(20),
};
export function listResponse(value: NotificationPage = page) {
  return contractJson("/me/notifications", "get", 200, value);
}
export function summaryResponse(unreadNotifications = 3) {
  return contractJson("/me/summary", "get", 200, {
    unreadNotifications,
    unreadMessages: 0,
  });
}
export function preferenceResponse(method: "get" | "put", rows = preferences) {
  return contractJson("/me/notification-preferences", method, 200, rows);
}
export function errorResponse(status = 500) {
  return HttpResponse.json(
    {
      error: {
        code: "REQUEST_INCOMPLETE",
        message: "Yêu cầu chưa đầy đủ.",
        requestId: id(999),
      },
    },
    { status },
  );
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
export function harness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});
export const teacherChangedNotices = [
  { className: "IELTS Foundation A" },
  { className: "IELTS Foundation A", teacherName: "Trần Minh Khoa" },
].map((params, index) => ({
  kind: "class.teacher_changed",
  params,
  target: { route: "classes" },
  id: id(210 + index),
  createdAt: "2026-10-01T12:00:00Z",
  readAt: null,
})) as Notification[];
