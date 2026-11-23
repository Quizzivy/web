import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import ClassDetailPage from "@/features/classes/pages/teacher/ClassDetailPage";
import ClassesPage from "@/features/classes/pages/teacher/ClassesPage";
import TeacherDashboardPage from "@/features/dashboard/pages/teacher/TeacherDashboardPage";
import { JoinDialog } from "@/features/join/components/JoinDialog";
import JoinPage from "@/features/join/pages/JoinPage";
import TeacherLayout from "@/layouts/TeacherLayout";
import { writeSidebarState } from "@/layouts/shell/sidebarState";
import type { components } from "@/lib/api/schema";
import { loadSurface } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";

/**
 * T-R8.14: the schedule on the class cards, in Edit class and the class's own
 * card in class detail, on the dashboard's Today and on the join preview, on
 * a fetch that answers from the deck's sample (IELTS 6.5 Evening, "T2 · T4 ·
 * T6, 18:00 · Phòng 2"; TOEIC 600 Weekend's "T7 · CN, 09:00 · Phòng 4").
 */

const SURFACES = Promise.all([loadSurface("teacher"), loadSurface("student")]);

type Schemas = components["schemas"];

function uid(n: number, head = "0193"): string {
  return `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

const TEACHER_KEYS = [
  "content.tests.write",
  "teaching.classes.write",
  "teaching.assignments.write",
  "teaching.attendance",
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

const MWF: Schemas["ClassSchedule"] = {
  slots: [1, 3, 5].map((weekday) => ({
    weekday: weekday as Schemas["IsoWeekday"],
    startTime: "18:00",
    durationMinutes: 90,
  })),
  label: "Tối 2-4-6",
};

const WEEKEND: Schemas["ClassSchedule"] = {
  slots: [6, 7].map((weekday) => ({
    weekday: weekday as Schemas["IsoWeekday"],
    startTime: "09:00",
    durationMinutes: 120,
  })),
  label: null,
};

const CODE = {
  code: "K7QM-2PXA",
  hint: "2PXA",
  legacy: false,
  expiresAt: "2099-01-01T16:59:59Z",
  maxUses: 40,
  usesCount: 3,
};

function klass(
  n: number,
  name: string,
  schedule: Schemas["ClassSchedule"],
  room: string | null,
  ownRoom: string | null,
): Schemas["ClassListItem"] {
  return {
    id: uid(n),
    name,
    description: null,
    scheduleLabel: schedule.label,
    room,
    ownRoom,
    schedule,
    studentCount: 24,
    openAssignmentCount: 1,
    selfJoinEnabled: true,
    archivedAt: null,
    joinCode: { ...CODE },
    averageScore: { earned: 74, total: 100, pendingManual: 0 },
    createdAt: "2026-08-03T03:00:00Z",
  };
}

const CLASSES = [
  klass(11, "IELTS 6.5 Evening", MWF, "Phòng 2", null),
  klass(
    12,
    "IELTS Writing Clinic",
    {
      slots: [
        { weekday: 2, startTime: "18:00", durationMinutes: 90 },
        { weekday: 4, startTime: "18:00", durationMinutes: 90 },
        { weekday: 6, startTime: "09:00", durationMinutes: 120 },
      ],
      label: null,
    },
    "Phòng 3",
    "Phòng 3",
  ),
  klass(13, "Kids Starters B", { slots: [], label: "Thứ 7, sáng" }, null, null),
  klass(14, "TOEIC 600 Weekend", { slots: [], label: null }, null, null),
];

const later = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

function dashboard(): Schemas["Dashboard"] {
  return {
    awaitingGrading: 6,
    flaggedAttempts: 1,
    newestFlaggedAttempt: null,
    closingSoon: 1,
    waitingStudents: 0,
    oldestWaitingAt: null,
    nextClosing: null,
    takingNow: { students: 0, assignments: 0, assignmentId: null },
    submissions: {
      days: Array.from({ length: 14 }, (_, index) => ({
        date: new Date(Date.now() - (13 - index) * 86_400_000)
          .toISOString()
          .slice(0, 10),
        count: (index * 7) % 5,
      })),
      total: 28,
      averagePercent: 72,
    },
    today: [
      {
        kind: "session",
        at: later(-20),
        sessionId: `${uid(91)}.20260924`,
        classId: uid(11),
        className: "IELTS 6.5 Evening",
        room: "Phòng 2",
      },
      {
        kind: "closes",
        at: later(90),
        assignmentId: uid(21),
        title: "Mid-term Reading Mock",
        notSubmitted: 6,
      },
      {
        kind: "session",
        at: later(150),
        sessionId: uid(92),
        classId: uid(12),
        className: "IELTS Writing Clinic",
        room: null,
      },
    ],
    recentActivity: [],
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function serve(): typeof window.fetch {
  return async (input) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const path = url.pathname;
    if (path === "/teacher/summary")
      return json({
        liveAssignments: 3,
        answersToGrade: 6,
        unreadNotifications: 0,
        sharedWithMe: 0,
        unreadMessages: 0,
      });
    if (path === "/me/summary")
      return json({ unreadNotifications: 0, unreadMessages: 0 });
    if (path === "/me/notifications") return json({ items: [], nextBefore: null });
    if (path === "/teacher/dashboard") return json(dashboard());
    if (path === "/teacher/classes")
      return json({
        items: CLASSES,
        page: 1,
        pageSize: 24,
        total: CLASSES.length,
        facets: { all: 4, joinable: 4, archived: 0, students: 96 },
      });
    const detail = /^\/teacher\/classes\/([^/]+)$/.exec(path);
    if (detail) {
      const found = CLASSES.find((c) => c.id === detail[1]) ?? CLASSES[0]!;
      return json({ ...found, joinCode: null, averageScore: null });
    }
    if (/^\/teacher\/classes\/[^/]+\/members$/.test(path))
      return json({ items: [], page: 1, pageSize: 20, total: 0 });
    if (path === "/teacher/assignments")
      return json({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        facets: { all: 0, draft: 0, scheduled: 0, open: 0, closed: 0 },
      });
    if (path === "/join/preview")
      return json({
        classId: uid(14),
        className: "TOEIC 600 Weekend",
        teacherName: "Giàu Bùi",
        schedule: WEEKEND,
        room: "Phòng 4",
      });
    if (path === "/app/classes") return json({ items: [] });
    if (path === "/public/organization")
      return json({
        name: "Quizzivy",
        shortName: null,
        website: null,
        contactEmail: null,
        frontDeskPhone: null,
        frontDeskHours: null,
        address: null,
        logo: { lightUrl: null, darkUrl: null },
        signIn: { google: true, password: true },
        joinCodes: true,
      });
    return new Response(null, { status: 404 });
  };
}

function teacher(path: string): () => ReactElement {
  return function R814Teacher() {
    use(SURFACES);
    const [state] = useState(() => {
      signIn(false);
      writeSidebarState("expanded");
      window.fetch = serve();
      const tree: RouteObject = {
        path: "/teacher",
        element: <TeacherLayout />,
        children: [
          {
            index: true,
            handle: { crumb: [{ key: "teacherShell.nav.dashboard" }] },
            element: <TeacherDashboardPage />,
          },
          {
            path: "classes",
            handle: { crumb: [{ key: "teacherShell.nav.classes" }] },
            element: <ClassesPage />,
          },
          {
            path: "classes/:id",
            handle: {
              crumb: [
                { key: "teacherShell.nav.classes", to: "/teacher/classes" },
                { key: "classDetail.crumb" },
              ],
            },
            element: <ClassDetailPage />,
          },
          { path: "*", element: <div className="h-40" /> },
        ],
      };
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter([tree], { initialEntries: [path] }),
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
  classes: teacher("/teacher/classes"),
  "class-detail": teacher(`/teacher/classes/${uid(11)}`),
  dashboard: teacher("/teacher"),
  "join-page": function R814JoinPage() {
    use(SURFACES);
    const [state] = useState(() => {
      useAuthStore.setState({ accessToken: null, user: null });
      window.fetch = serve();
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter(
          [
            { path: "/join/:code", element: <JoinPage /> },
            { path: "*", element: <div /> },
          ],
          { initialEntries: ["/join/K7QM2PXA"] },
        ),
      };
    });
    return (
      <QueryClientProvider client={state.client}>
        <div className="fixed inset-0 z-10 overflow-auto">
          <RouterProvider router={state.router} />
        </div>
      </QueryClientProvider>
    );
  },
  "join-dialog": function R814JoinDialog() {
    use(SURFACES);
    const [state] = useState(() => {
      signIn(true);
      window.fetch = serve();
      return new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });
    return (
      <QueryClientProvider client={state}>
        <JoinDialog open onOpenChange={() => undefined} />
      </QueryClientProvider>
    );
  },
};
