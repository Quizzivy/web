import type { components } from "@/lib/api/schema";

/**
 * Shared fixtures, typed against the generated contract. The types stop a
 * fixture inventing a field; `contractJson` stops it from being the wrong
 * shape at runtime. Vietnamese names throughout, since that is the product.
 */

export const studentRole: components["schemas"]["CurrentUserRole"] = {
  id: "019535d8-0000-7000-8000-000000000004",
  builtinKey: "student",
  name: "Học viên",
};

export const assistantRole: components["schemas"]["CurrentUserRole"] = {
  id: "019535d8-0000-7000-8000-000000000003",
  builtinKey: "assistant",
  name: "Trợ giảng",
};

export const teacherRole: components["schemas"]["CurrentUserRole"] = {
  id: "019535d8-0000-7000-8000-000000000002",
  builtinKey: "teacher",
  name: "Giáo viên",
};

export const adminRole: components["schemas"]["CurrentUserRole"] = {
  id: "019535d8-0000-7000-8000-000000000001",
  builtinKey: "admin",
  name: "Quản trị viên",
};

export const studentUser: components["schemas"]["CurrentUser"] = {
  id: "019535d9-3df7-79fb-b466-fa907fa17f9e",
  email: "hocvien@example.com",
  fullName: "Nguyễn Văn An",
  role: studentRole,
  hasPassword: true,
  linkedProviders: [],
  mustChangePassword: false,
  createdAt: "2026-01-01T00:00:00Z",
  permissions: ["learning.take_tests"],
  workspaces: ["app"],
};

export const adminUser: components["schemas"]["CurrentUser"] = {
  ...studentUser,
  id: "019535d9-3df7-79fb-b466-fa907fa17f9f",
  email: "thuong@example.com",
  fullName: "Thuong",
  role: adminRole,
  permissions: [
    "content.tests.write",
    "content.tests.publish",
    "content.questions.write",
    "content.media.write",
    "content.share",
    "ai.use",
    "teaching.classes.write",
    "teaching.assignments.write",
    "teaching.grading",
    "teaching.attempts.intervene",
    "teaching.attendance",
    "people.students.read",
    "people.students.create",
    "people.students.reset_password",
    "people.users.manage",
    "people.roles.manage",
    "system.audit.read",
    "system.settings.write",
    "ai.credits.manage",
    "scope.all",
    "system.api_reference",
    "system.data_export",
    "system.leads",
  ],
  workspaces: ["teacher", "admin"],
};

export const teacherUser: components["schemas"]["CurrentUser"] = {
  ...studentUser,
  id: "019535d9-3df7-79fb-b466-fa907fa17fa0",
  email: "giaovien@example.com",
  fullName: "Trần Thị Bình",
  role: teacherRole,
  permissions: [
    "content.tests.write",
    "content.tests.publish",
    "content.questions.write",
    "content.media.write",
    "content.share",
    "ai.use",
    "teaching.classes.write",
    "teaching.assignments.write",
    "teaching.grading",
    "teaching.attempts.intervene",
    "teaching.attendance",
    "people.students.read",
    "people.students.create",
    "people.students.reset_password",
  ],
  workspaces: ["teacher"],
};

export const assistantUser: components["schemas"]["CurrentUser"] = {
  ...studentUser,
  id: "019535d9-3df7-79fb-b466-fa907fa17fa1",
  email: "trogiang@example.com",
  fullName: "Lê Văn Cường",
  role: assistantRole,
  permissions: [
    "content.tests.write",
    "content.questions.write",
    "teaching.assignments.write",
    "teaching.grading",
    "teaching.attendance",
    "people.students.read",
  ],
  workspaces: ["teacher"],
};

export const adminWhoTakesTests: components["schemas"]["CurrentUser"] = {
  ...adminUser,
  permissions: [...adminUser.permissions, "learning.take_tests"],
  workspaces: ["teacher", "admin", "app"],
};

export const myClass: components["schemas"]["MyClass"] = {
  id: "019535da-0000-7000-8000-000000000001",
  name: "Tiếng Anh giao tiếp - Lớp A",
  description: null,
  teacherId: "0190a000-0000-7000-8000-00000000a101",
  teacherName: "Cô Thương",
  teacherAvatarUrl: null,
  scheduleLabel: null,
  room: null,
  schedule: { slots: [], label: null },
  joinedAt: "2026-06-12T01:00:00Z",
};

export const sampleClass: components["schemas"]["Class"] = {
  id: "019535da-0000-7000-8000-000000000001",
  name: "Tiếng Anh giao tiếp - Lớp A",
  description: null,
  schedule: { slots: [], label: null },
  studentCount: 12,
  openAssignmentCount: 0,
  archivedAt: null,
  selfJoinEnabled: true,
  joinCode: null,
  createdAt: "2026-01-01T00:00:00Z",
};

/**
 * The seven notification switches as the server answers a caller who never
 * changed one: the defaults the contract writes in `NotificationEvent`, in
 * the enum's order. A student's rows keep `email` equal to `inApp` (DG-82).
 */
export const notificationDefaults: components["schemas"]["NotificationPreference"][] = [
  { event: "attempt.submitted", inApp: true, email: false },
  { event: "attempt.flagged", inApp: true, email: true },
  { event: "assignment.closing", inApp: true, email: false },
  { event: "assignment.due_soon", inApp: true, email: true },
  { event: "result.ready", inApp: true, email: true },
  { event: "message.received", inApp: true, email: true },
  { event: "summary.weekly", inApp: false, email: true },
];

/**
 * sampleTerms are the centre's terms as the deck draws them on 24 September
 * 2026, newest first, as `GET /admin/settings/terms` returns them.
 */
export const sampleTerms: components["schemas"]["Term"][] = [
  {
    id: "0196f7c0-0000-7000-8000-000000000003",
    name: "Xuân 2027",
    startsOn: "2027-01-04",
    endsOn: "2027-04-25",
    state: "upcoming",
  },
  {
    id: "0196f7c0-0000-7000-8000-000000000002",
    name: "Thu 2026",
    startsOn: "2026-09-01",
    endsOn: "2026-12-20",
    state: "current",
  },
  {
    id: "0196f7c0-0000-7000-8000-000000000001",
    name: "Hè 2026",
    startsOn: "2026-06-01",
    endsOn: "2026-08-22",
    state: "past",
  },
];
