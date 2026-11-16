import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import StudentSettingsPage from "@/features/auth/pages/StudentSettingsPage";
import TeacherSettingsPage from "@/features/settings/pages/teacher/TeacherSettingsPage";
import StudentLayout from "@/layouts/StudentLayout";
import TeacherLayout from "@/layouts/TeacherLayout";
import { writeSidebarState } from "@/layouts/shell/sidebarState";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The teacher's and the student's strings, which the harness does not load by itself. */
const SURFACES = Promise.all([loadSurface("teacher"), loadSurface("student")]);

type Schemas = components["schemas"];

function uid(n: number, head = "0193"): string {
  return `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

const TEACHER_KEYS = [
  "content.tests.write",
  "content.tests.publish",
  "content.questions.write",
  "content.media.write",
  "content.share",
  "teaching.classes.write",
  "teaching.assignments.write",
  "teaching.grading",
  "people.students.read",
];

function signIn(student: boolean) {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: uid(1, "0195"),
      email: student ? "giabao.ng@gmail.com" : "giau.bui@quizzivy.com",
      fullName: student ? "Nguyễn Gia Bảo" : "Giàu Bùi",
      hasPassword: true,
      linkedProviders: [],
      mustChangePassword: false,
      createdAt: "2026-01-01T00:00:00Z",
      role: {
        id: uid(2, "0195"),
        builtinKey: student ? "student" : "teacher",
        name: student ? "Học viên" : "Giáo viên",
      },
      permissions: student ? ["learning.take_tests"] : TEACHER_KEYS,
      workspaces: student ? ["app"] : ["teacher"],
    } as unknown as Schemas["CurrentUser"],
  });
}

/** The server's answer for an account that never changed a switch (T-R7.13's table). */
const DEFAULTS: Schemas["NotificationPreference"][] = [
  { event: "attempt.submitted", inApp: true, email: false },
  { event: "attempt.flagged", inApp: true, email: true },
  { event: "assignment.closing", inApp: true, email: false },
  { event: "assignment.due_soon", inApp: true, email: true },
  { event: "result.ready", inApp: true, email: true },
  { event: "message.received", inApp: true, email: true },
  { event: "summary.weekly", inApp: false, email: true },
];

const at = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

/** The bell's rows: R7's kinds, newest first, beside one of the deck's own. */
const TEACHER_ITEMS = [
  {
    kind: "message.received",
    params: {
      senderName: "Trần Minh Anh",
      count: 2,
      excerpt: "Em nộp lại bài được không ạ?",
    },
    target: { route: "messages", studentId: uid(31) },
    createdAt: at(4),
    readAt: null,
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
    createdAt: at(35),
    readAt: null,
  },
  {
    kind: "test.published_by_collaborator",
    params: { editorName: "Lý Thanh Vân", title: "Mid-term Reading Mock", version: 4 },
    target: { route: "test", testId: uid(41) },
    createdAt: at(80),
    readAt: null,
  },
  {
    kind: "summary.weekly",
    params: { count: 41, toGrade: 6, flagged: 2, classNames: ["IELTS 6.5 Evening"] },
    target: { route: "dashboard" },
    createdAt: at(60 * 20),
    readAt: at(60 * 19),
  },
  {
    kind: "content.shared",
    params: {
      sharerName: "Phan Minh Đức",
      contentKind: "test",
      name: "IELTS Reading Practice 3",
      access: "edit",
    },
    target: { route: "sharedWithMe" },
    createdAt: at(60 * 30),
    readAt: at(60 * 29),
  },
  {
    kind: "class.joined",
    params: { studentName: "Nguyễn Gia Bảo", className: "IELTS Foundation A" },
    target: { route: "classes" },
    createdAt: at(60 * 40),
    readAt: at(60 * 39),
  },
];

const STUDENT_ITEMS = [
  {
    kind: "message.from_teacher",
    params: {
      senderName: "Giàu Bùi",
      count: 1,
      excerpt: "Nhớ ôn Unit 4 trước thứ Sáu nhé",
    },
    target: { route: "studentMessages", teacherId: uid(51) },
    createdAt: at(6),
    readAt: null,
  },
  {
    kind: "message.from_teacher",
    params: {
      senderName: "Giàu Bùi",
      count: 3,
      excerpt: "Lớp tối nay nghỉ, các em làm bài Unit 5 ở nhà",
      className: "IELTS 6.5 Evening",
    },
    target: { route: "studentMessages", classId: uid(61) },
    createdAt: at(50),
    readAt: null,
  },
  {
    kind: "result.ready",
    params: { title: "Unit 3 grammar check" },
    target: { route: "result", attemptId: uid(71) },
    createdAt: at(60 * 24),
    readAt: at(60 * 23),
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** serve answers the shells' and the sections' calls from the fixtures. */
function serve(student: boolean): typeof window.fetch {
  let rows = DEFAULTS;
  const items = (student ? STUDENT_ITEMS : TEACHER_ITEMS).map((item, index) => ({
    ...item,
    id: uid(index + 101),
  }));
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    if (path === "/teacher/summary")
      return json({
        liveAssignments: 3,
        answersToGrade: 6,
        unreadNotifications: 3,
        sharedWithMe: 4,
        unreadMessages: 2,
      });
    if (path === "/me/summary")
      return json({ unreadNotifications: student ? 2 : 3, unreadMessages: 1 });
    if (path === "/me/notifications") return json({ items, nextBefore: null });
    if (path === "/me/notification-preferences") {
      if (method === "PUT") rows = JSON.parse(String(init?.body)) as typeof rows;
      return json(rows);
    }
    return new Response(null, { status: 404 });
  };
}

type Options = Readonly<{ student?: boolean }>;

/** shell mounts the real teacher or student shell at `path` on a fetch that answers from the fixtures. */
function shell(path: string, options: Options = {}): () => ReactElement {
  return function R723Case() {
    use(SURFACES);
    const [state] = useState(() => {
      const student = options.student === true;
      signIn(student);
      writeSidebarState("expanded");
      window.fetch = serve(student);
      const teacher: RouteObject = {
        path: "/teacher",
        element: <TeacherLayout />,
        children: [
          {
            index: true,
            handle: { crumb: [{ key: "teacherShell.nav.dashboard" }] },
            element: <div className="h-40" />,
          },
          {
            path: "settings/:section?",
            handle: { crumb: [{ key: "nav.settings" }] },
            element: <TeacherSettingsPage />,
          },
          { path: "*", element: <div className="h-40" /> },
        ],
      };
      const learner: RouteObject = {
        path: "/",
        element: <StudentLayout />,
        children: [
          { index: true, element: <div className="h-40" /> },
          {
            path: "settings/:section?",
            handle: { detail: { titleKey: "nav.settings", back: "/" } },
            element: <StudentSettingsPage />,
          },
          { path: "*", element: <div className="h-40" /> },
        ],
      };
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter([teacher, learner], { initialEntries: [path] }),
      };
    });
    return (
      <QueryClientProvider client={state.client}>
        <div className="fixed inset-0 z-10">
          <RouterProvider router={state.router} />
        </div>
        <Toaster />
      </QueryClientProvider>
    );
  };
}

export const cases: Record<string, () => ReactElement> = {
  "teacher-settings": shell("/teacher/settings/notifications"),
  "teacher-bell": shell("/teacher"),
  "student-settings": shell("/settings/notifications", { student: true }),
  "student-bell": shell("/", { student: true }),
};
