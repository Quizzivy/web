import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import AttendancePage from "@/features/attendance/pages/teacher/AttendancePage";
import ClassDetailPage from "@/features/classes/pages/teacher/ClassDetailPage";
import TeacherLayout from "@/layouts/TeacherLayout";
import { writeSidebarState } from "@/layouts/shell/sidebarState";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The teacher's strings, which the harness does not load by itself. */
const SURFACES = loadSurface("teacher");

type Schemas = components["schemas"];

function uid(n: number, head = "0198"): string {
  return `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

const CLASS = uid(1);
const OTHER = uid(2);
const WEEKEND = uid(3);
const SERIES = uid(9);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** at is an instant `ms` before now, on a whole five minutes. */
const at = (ms: number) =>
  new Date(Math.floor((Date.now() - ms) / 300_000) * 300_000).toISOString();

const occurrence = (days: number) => `${SERIES}.d${days}`;

function signIn() {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: uid(100, "0195"),
      email: "giau.bui@quizzivy.com",
      fullName: "Giàu Bùi",
      hasPassword: true,
      linkedProviders: [],
      mustChangePassword: false,
      createdAt: "2026-01-01T00:00:00Z",
      role: { id: uid(101, "0195"), builtinKey: "teacher", name: "Giáo viên" },
      permissions: [
        "teaching.classes.write",
        "teaching.assignments.write",
        "teaching.grading",
        "teaching.attendance",
        "people.students.read",
      ],
      workspaces: ["teacher"],
    } as unknown as Schemas["CurrentUser"],
  });
}

const NAMES = [
  "Trần Minh Anh",
  "Lê Hoàng Nam",
  "Nguyễn Gia Bảo",
  "Phạm Thu Hà",
  "Đỗ Phương Thảo",
  "Vũ Thu Trang",
  "Bùi Quang Huy",
  "Hoàng Đức Long",
];
const RATES = [100, 92, 85, 96, 71, 88, 79, null];

type Row = Schemas["AttendanceSessionRow"];
type Register = Schemas["SessionAttendance"];

function row(over: Partial<Row>): Row {
  return {
    id: occurrence(0),
    classId: CLASS,
    className: "IELTS 6.5 Evening",
    room: "Phòng 2",
    startsAt: at(HOUR),
    marked: false,
    studentCount: NAMES.length,
    counts: null,
    ...over,
  };
}

const TODAY = row({});
const OWED = row({
  id: uid(20),
  classId: OTHER,
  className: "IELTS Foundation A",
  room: "Phòng 1",
  startsAt: at(DAY + 2 * HOUR),
  studentCount: 18,
});
const SAVED = [
  row({
    id: occurrence(2),
    startsAt: at(2 * DAY + HOUR),
    marked: true,
    counts: { present: 6, late: 1, absent: 1 },
  }),
  row({
    id: uid(21),
    classId: WEEKEND,
    className: "TOEIC 600 Weekend",
    room: null,
    startsAt: at(4 * DAY + 10 * HOUR),
    marked: true,
    counts: { present: 15, late: 0, absent: 1 },
  }),
];

function session(
  id: string,
  startsAt: string,
  cancelled = false,
): Schemas["ClassSession"] {
  return {
    id,
    classId: CLASS,
    className: "IELTS 6.5 Evening",
    seriesId: SERIES,
    series: null,
    date: startsAt.slice(0, 10),
    startsAt,
    durationMinutes: 90,
    room: "Phòng 2",
    note: null,
    cancelled,
    changed: false,
    hasAttendance: false,
  };
}

function register(
  id: string,
  startsAt: string,
  options: Readonly<{ marks?: boolean; cancelled?: boolean; overall?: boolean }> = {},
): Register {
  const students = NAMES.map((fullName, index) => ({
    studentId: uid(200 + index),
    fullName,
    avatarUrl: null,
    status: options.marks
      ? ((
          [
            "present",
            "present",
            "late",
            "present",
            "absent",
            "present",
            "present",
            "present",
          ] as const
        )[index] ?? null)
      : null,
    note: options.marks && index === 4 ? "Báo ốm qua Zalo" : null,
    rate: RATES[index] ?? null,
  }));
  const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
  for (const student of students) counts[student.status ?? "unmarked"] += 1;
  return {
    session: {
      ...session(id, startsAt, options.cancelled === true),
      hasAttendance: counts.unmarked < students.length,
    },
    term: options.overall ? null : { id: uid(30), name: "Học kỳ 1" },
    rateScope: options.overall ? "overall" : "term",
    counts,
    students,
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

/** listFor is a page of the sessions list for the card or class `query` asks for. */
function listFor(query: URLSearchParams, options: Options) {
  const page = (items: Row[]) => ({ items, nextBefore: null, notMarked: 2 });
  if (options.empty) return { items: [], nextBefore: null, notMarked: 0 };
  if (query.get("classId") !== null) {
    const mine = [TODAY, SAVED[0]!];
    return page(query.get("limit") === "1" ? mine.slice(0, 1) : mine);
  }
  if (query.get("marked") === "false") return page([OWED]);
  if (query.get("marked") === "true") return page(SAVED);
  return page([TODAY]);
}

/** saveMarks applies a save's marks to a stored register, as the server does. */
function saveMarks(found: Register, body: Schemas["AttendanceSave"]): Register {
  const students = found.students.map((student) => {
    const mark = body.marks.find((entry) => entry.studentId === student.studentId);
    if (mark === undefined) return student;
    if (mark.status === null) return { ...student, status: null, note: null };
    return { ...student, status: mark.status, note: mark.note ?? student.note };
  });
  const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
  for (const student of students) counts[student.status ?? "unmarked"] += 1;
  return {
    ...found,
    students,
    counts,
    session: { ...found.session, hasAttendance: true },
  };
}

/** answerRegister reads or saves the register of session `raw`. */
function answerRegister(
  registers: Map<string, Register>,
  raw: string,
  method: string,
  init: RequestInit | undefined,
) {
  const id = decodeURIComponent(raw);
  const found = registers.get(id);
  if (found === undefined)
    return json({ error: { code: "NOT_FOUND", message: "" } }, 404);
  if (method !== "PUT") return json(found);
  const saved = saveMarks(
    found,
    JSON.parse(String(init?.body)) as Schemas["AttendanceSave"],
  );
  registers.set(id, saved);
  return json(saved);
}

type Options = Readonly<{ empty?: boolean; overall?: boolean }>;

/** serve answers the shell's and the two screens' calls from the fixtures. */
function serve(options: Options): typeof window.fetch {
  const registers = new Map<string, Register>([
    [
      TODAY.id,
      register(TODAY.id, TODAY.startsAt, { overall: options.overall === true }),
    ],
    [SAVED[0]!.id, register(SAVED[0]!.id, SAVED[0]!.startsAt, { marks: true })],
    [occurrence(-2), register(occurrence(-2), at(-2 * DAY))],
    [
      occurrence(5),
      register(occurrence(5), at(5 * DAY), { cancelled: true, marks: true }),
    ],
  ]);
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const query = url.searchParams;
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
    if (path === `/teacher/classes/${CLASS}`)
      return json({
        id: CLASS,
        name: "IELTS 6.5 Evening",
        description: null,
        scheduleLabel: "T2 · T4 · T6, 18:00",
        room: "Phòng 2",
        ownRoom: "Phòng 2",
        schedule: { slots: [], label: "T2 · T4 · T6, 18:00" },
        studentCount: NAMES.length,
        openAssignmentCount: 1,
        archivedAt: null,
        selfJoinEnabled: true,
        joinCode: null,
        createdAt: "2026-06-01T00:00:00Z",
      });
    if (path === "/teacher/attendance/sessions") return json(listFor(query, options));
    const match = /^\/teacher\/sessions\/([^/]+)\/attendance$/.exec(path);
    if (match !== null) return answerRegister(registers, match[1]!, method, init);
    return new Response(null, { status: 404 });
  };
}

/** shell mounts the real teacher shell at `path` on a fetch that answers from the fixtures. */
function shell(path: string, options: Options = {}): () => ReactElement {
  return function R812Case() {
    use(SURFACES);
    const [state] = useState(() => {
      signIn();
      writeSidebarState("expanded");
      window.fetch = serve(options);
      const teacher: RouteObject = {
        path: "/teacher",
        element: <TeacherLayout />,
        children: [
          {
            path: "attendance",
            handle: { crumb: [{ key: "teacherShell.nav.attendance" }] },
            element: <AttendancePage />,
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
        router: createMemoryRouter([teacher], { initialEntries: [path] }),
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

function tab(session?: string) {
  const search = new URLSearchParams({ tab: "attendance" });
  if (session !== undefined) search.set("session", session);
  return `/teacher/classes/${CLASS}?${search.toString()}`;
}

export const cases: Record<string, () => ReactElement> = {
  page: shell("/teacher/attendance"),
  "page-empty": shell("/teacher/attendance", { empty: true }),
  register: shell(tab()),
  "register-overall": shell(tab(), { overall: true }),
  "register-saved": shell(tab(occurrence(2))),
  "register-not-started": shell(tab(occurrence(-2))),
  "register-cancelled": shell(tab(occurrence(5))),
  "register-none": shell(tab(), { empty: true }),
};
