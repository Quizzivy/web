import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import ClassDetailPage from "@/features/classes/pages/teacher/ClassDetailPage";
import type { LibraryAsset } from "@/features/media/api";
import { DeleteMediaDialog } from "@/features/media/components/DeleteMediaDialog";
import SystemSettingsPage from "@/features/organization/pages/admin/SystemSettingsPage";
import StudentsPage from "@/features/students/pages/teacher/StudentsPage";
import AdminLayout from "@/layouts/AdminLayout";
import TeacherLayout from "@/layouts/TeacherLayout";
import { writeSidebarState } from "@/layouts/shell/sidebarState";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The teacher's and the Admin's strings, which the harness does not load by itself. */
const SURFACES = Promise.all([loadSurface("teacher"), loadSurface("admin")]);

type Schemas = components["schemas"];

function uid(n: number, head = "0193"): string {
  return `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

const ME = uid(1, "0195");
const C1 = { id: uid(11, "0191"), name: "IELTS 6.5 Evening" };
const C2 = { id: uid(12, "0191"), name: "IELTS Foundation A" };

const TEACHER_KEYS = [
  "content.tests.write",
  "content.tests.publish",
  "content.questions.write",
  "content.media.write",
  "content.share",
  "teaching.classes.write",
  "teaching.assignments.write",
  "teaching.grading",
  "teaching.attempts.intervene",
  "people.students.read",
  "people.students.create",
  "people.students.reset_password",
];
const ADMIN_KEYS = [
  ...TEACHER_KEYS,
  "people.users.manage",
  "people.roles.manage",
  "system.audit.read",
  "system.settings.write",
  "scope.all",
  "system.data_export",
];

function signIn(admin: boolean) {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: ME,
      email: "giau.bui@quizzivy.com",
      fullName: "Giàu Bùi",
      hasPassword: true,
      linkedProviders: [],
      mustChangePassword: false,
      createdAt: "2026-01-01T00:00:00Z",
      role: {
        id: uid(2, "0195"),
        builtinKey: admin ? "admin" : "teacher",
        name: admin ? "Quản trị viên" : "Giáo viên",
      },
      permissions: admin ? ADMIN_KEYS : TEACHER_KEYS,
      workspaces: admin ? ["teacher", "admin"] : ["teacher"],
    } as unknown as Schemas["CurrentUser"],
  });
}

function stats(submitted: number, earned: number | null) {
  return {
    submittedCount: submitted,
    flaggedCount: 0,
    ...(earned === null ? {} : { score: { earned, total: 50, pendingManual: 0 } }),
    activity: { live: false, lastAttemptAt: null },
  };
}

const PEOPLE: readonly [string, (typeof C1)[], number, number | null][] = [
  ["Lê Hoàng Nam", [C1], 6, 41],
  ["Phạm Thu Hà", [C1, C2], 5, 37],
  ["Đỗ Phương Thảo", [C2], 4, 28],
  ["Trần Minh Thư", [C1], 3, 44],
  ["Vũ Ngọc Trang", [], 0, null],
];

function studentRows(): Schemas["StudentRow"][] {
  return PEOPLE.map(([name, classes, submitted, earned], index) => ({
    id: uid(index + 1, "0192"),
    email: `hs${index + 1}@gmail.com`,
    fullName: name,
    hasPassword: true,
    linkedProviders: [],
    mustChangePassword: false,
    createdAt: "2026-08-01T00:00:00Z",
    disabledAt: null,
    lastActiveAt: new Date(Date.now() - (index + 1) * 3_600_000).toISOString(),
    accountStatus: "active",
    classes: classes.map((klass) => ({
      id: klass.id,
      name: klass.name,
      joinedVia: "admin",
      joinedAt: "2026-08-12T00:00:00Z",
    })),
    stats: stats(submitted, earned),
    canMessage: classes.length > 0,
  })) as Schemas["StudentRow"][];
}

function members(): Schemas["ClassMember"][] {
  return PEOPLE.filter(([, classes]) => classes.includes(C1)).map(
    ([name, , submitted, earned], index) => ({
      userId: uid(index + 1, "0192"),
      fullName: name,
      email: `hs${index + 1}@gmail.com`,
      joinedVia: index % 2 === 0 ? "admin" : "join_code",
      joinCodeHint: index % 2 === 0 ? null : "K7Q",
      joinedAt: "2026-08-12T00:00:00Z",
      stats: stats(submitted, earned),
      canMessage: true,
    }),
  ) as Schemas["ClassMember"][];
}

const CLASS = {
  id: C1.id,
  name: C1.name,
  description: "Lớp tối thứ Ba, thứ Năm.",
  scheduleLabel: "Thứ 3, 5 · 18:00",
  room: "Phòng 3",
  studentCount: 3,
  openAssignmentCount: 0,
  selfJoinEnabled: true,
  archivedAt: null,
  joinCode: null,
  averageScore: null,
  createdAt: "2026-08-01T00:00:00Z",
};

const SETTINGS = {
  organization: {
    name: "Ms Giau English Centre",
    shortName: "Ms Giau",
    website: null,
    contactEmail: null,
    frontDeskPhone: null,
    frontDeskHours: null,
    address: null,
    logo: { light: null, dark: null },
  },
  signIn: {
    google: true,
    password: true,
    forcePasswordChange: true,
    joinCodes: true,
    allowedGoogleDomains: [],
  },
  retention: {
    keepAnswersMonths: 24,
    keepFocusEventsMonths: 13,
    anonymiseDisabledAfterMonths: null,
  },
  limits: {
    seats: null,
    teachers: null,
    storageBytes: null,
    mediaPerTeacherBytes: null,
    importBytes: null,
    importPerTeacherBytes: null,
    emailsPerDay: null,
    emailsPerMonth: null,
    databaseBytes: null,
    warnAtPercent: null,
  },
  limitDefaults: {
    seats: { value: null, source: "none" },
    teachers: { value: null, source: "none" },
    storageBytes: { value: 10 * 1024 ** 3, source: "r2_free" },
    mediaPerTeacherBytes: { value: 5 * 1024 ** 3, source: "app" },
    importBytes: { value: 1024 ** 3, source: "app" },
    importPerTeacherBytes: { value: 256 * 1024 ** 2, source: "app" },
    emailsPerDay: { value: 100, source: "resend_free" },
    emailsPerMonth: { value: 3000, source: "resend_free" },
    databaseBytes: { value: 10 * 1024 ** 3, source: "vps_disk" },
    warnAtPercent: { value: 80, source: "app" },
  },
  leadRecipients: [],
  revision: 7,
  updatedAt: "2026-10-14T09:00:00Z",
  updatedBy: ME,
};

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const page = <T,>(items: T[], extra: object = {}) => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  ...extra,
});

/** serve answers the pages' calls from the deck's fixtures; the summary carries both new counts. */
function serve(unreadMessages: number): typeof window.fetch {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    if (path === "/teacher/summary")
      return json({
        liveAssignments: 3,
        answersToGrade: 6,
        unreadNotifications: 0,
        sharedWithMe: 4,
        unreadMessages,
      });
    if (path === "/teacher/students")
      return json(page(studentRows(), { facets: { total: 5, activeLast7Days: 4 } }));
    if (path === "/teacher/classes")
      return json(
        page(
          [C1, C2].map((klass) => ({ ...CLASS, ...klass })),
          {
            facets: { all: 2, joinable: 1, archived: 0, students: 4 },
          },
        ),
      );
    if (path === `/teacher/classes/${C1.id}`) return json(CLASS);
    if (path === `/teacher/classes/${C1.id}/members`) return json(page(members()));
    if (path === "/teacher/assignments")
      return json(page([], { facets: { all: 0, open: 0, scheduled: 0, closed: 0 } }));
    if (path === "/admin/settings") return json(SETTINGS);
    if (method === "DELETE" && path.startsWith("/teacher/media/"))
      return json(
        {
          error: {
            code: "MEDIA_IN_USE_ELSEWHERE",
            message: "Media is in use elsewhere.",
            requestId: uid(999),
            details: { count: 2 },
          },
        },
        409,
      );
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

const ASSET = {
  id: uid(501),
  kind: "audio",
  url: "#",
  mimeType: "audio/mpeg",
  bytes: 2_412_000,
  durationMs: 151_000,
  originalFilename: "unit4-listening.mp3",
  createdAt: "2026-10-01T00:00:00Z",
  displayName: "Unit 4 · Listening.mp3",
  usageCount: 0,
  questionCount: 1,
  usedIn: [],
} as unknown as LibraryAsset;

function MediaRefusal() {
  const [open, setOpen] = useState(true);
  const [focus] = useState(() => ({ current: null as HTMLElement | null }));
  return (
    <DeleteMediaDialog
      asset={open ? ASSET : null}
      returnFocus={focus}
      onOpenChange={setOpen}
      onDeleted={() => setOpen(false)}
    />
  );
}

type Options = Readonly<{ admin?: boolean; collapsed?: boolean; unread?: number }>;

/** shell mounts the real teacher or Admin shell at `path` on a fetch that answers from the fixtures. */
function shell(path: string, options: Options = {}): () => ReactElement {
  return function R722Case() {
    use(SURFACES);
    const [state] = useState(() => {
      signIn(options.admin === true);
      writeSidebarState(options.collapsed === true ? "collapsed" : "expanded");
      window.fetch = serve(options.unread ?? 3);
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
            path: "students",
            handle: { crumb: [{ key: "teacherShell.nav.students" }] },
            element: <StudentsPage />,
          },
          {
            path: "classes/:id",
            handle: {
              crumb: [{ key: "teacherShell.nav.classes", to: "/teacher/classes" }],
            },
            element: <ClassDetailPage />,
          },
          {
            path: "media",
            handle: { crumb: [{ key: "teacherShell.nav.media" }] },
            element: <MediaRefusal />,
          },
          { path: "*", element: <div className="h-40" /> },
        ],
      };
      const admin: RouteObject = {
        path: "/admin",
        element: <AdminLayout />,
        children: [{ path: "settings/:section?", element: <SystemSettingsPage /> }],
      };
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter([teacher, admin], { initialEntries: [path] }),
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
  nav: shell("/teacher"),
  "nav-collapsed": shell("/teacher", { collapsed: true }),
  "nav-many": shell("/teacher", { unread: 120 }),
  students: shell("/teacher/students"),
  "class-detail": shell(`/teacher/classes/${C1.id}`),
  "media-refused": shell("/teacher/media"),
  "data-privacy": shell("/admin/settings/data", { admin: true }),
};
