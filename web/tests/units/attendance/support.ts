import { http } from "msw";
import { vi } from "vitest";
import type { components } from "@/lib/api/schema";
import { assertContractRequest, contractJson } from "@tests/support/contractResponse";
import { server } from "@tests/support/server";

type Schemas = components["schemas"];
export type SessionRow = Schemas["AttendanceSessionRow"];
export type Register = Schemas["SessionAttendance"];
export type Student = Schemas["AttendanceStudent"];
export type Mark = Schemas["AttendanceMarkInput"];

export const BASE = "http://localhost:8080";
export const CLASS_ID = "018f0000-0000-7000-8000-0000000000c1";
export const OTHER_CLASS_ID = "018f0000-0000-7000-8000-0000000000c2";
export const SERIES_ID = "018f0000-0000-7000-8000-0000000000b1";

/** today puts the clock where the deck's does: Wednesday 24 September 2026, 20:15 in Hồ Chí Minh City. */
export function today() {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-24T13:15:00Z"));
}

/** occurrence is the id of the series' session on `yyyymmdd`. */
export const occurrence = (yyyymmdd: string) => `${SERIES_ID}.${yyyymmdd}`;

export const TODAY_ID = occurrence("20260924");
export const TUESDAY_ID = occurrence("20260923");
export const MONDAY_ID = occurrence("20260922");
export const FRIDAY_ID = occurrence("20260926");

export const klass = {
  id: CLASS_ID,
  name: "IELTS 6.5 Evening",
  description: null,
  scheduleLabel: "Mon · Wed · Fri, 18:00",
  room: "Phòng 2",
  schedule: { slots: [], label: "Mon · Wed · Fri, 18:00" },
  studentCount: 4,
  openAssignmentCount: 0,
  archivedAt: null,
  selfJoinEnabled: true,
  joinCode: null,
  createdAt: "2026-06-01T00:00:00Z",
};

/** sessionRow is a started session as the Attendance lists carry it. */
export function sessionRow(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: TODAY_ID,
    classId: CLASS_ID,
    className: "IELTS 6.5 Evening",
    room: "Phòng 2",
    startsAt: "2026-09-24T11:00:00Z",
    marked: false,
    studentCount: 24,
    counts: null,
    ...over,
  };
}

/** classSession is the session a register heads. */
export function classSession(
  over: Partial<Schemas["ClassSession"]> = {},
): Schemas["ClassSession"] {
  return {
    id: TODAY_ID,
    classId: CLASS_ID,
    className: "IELTS 6.5 Evening",
    seriesId: SERIES_ID,
    series: {
      id: SERIES_ID,
      classId: CLASS_ID,
      weekday: 3,
      startTime: "18:00",
      durationMinutes: 90,
      room: "Phòng 2",
      startsOn: "2026-09-01",
      endsOn: "2026-12-20",
      timeZone: "Asia/Ho_Chi_Minh",
    },
    date: "2026-09-24",
    startsAt: "2026-09-24T11:00:00Z",
    durationMinutes: 90,
    room: "Phòng 2",
    note: null,
    cancelled: false,
    changed: false,
    hasAttendance: false,
    ...over,
  };
}

export const ANH = "018f0000-0000-7000-8000-0000000000e1";
export const NAM = "018f0000-0000-7000-8000-0000000000e2";
export const BAO = "018f0000-0000-7000-8000-0000000000e3";
export const HA = "018f0000-0000-7000-8000-0000000000e4";

/** roster is the deck's first four students, unmarked, with their rates this term. */
export function roster(): Student[] {
  return [
    { studentId: ANH, fullName: "Trần Minh Anh", rate: 100 },
    { studentId: NAM, fullName: "Lê Hoàng Nam", rate: 92 },
    { studentId: BAO, fullName: "Nguyễn Gia Bảo", rate: 79 },
    { studentId: HA, fullName: "Phạm Thu Hà", rate: null },
  ].map((student) => ({ ...student, avatarUrl: null, status: null, note: null }));
}

/** register builds a session's register, its counts worked out from its roster. */
export function register(
  students: Student[] = roster(),
  over: Partial<Omit<Register, "counts" | "students">> = {},
): Register {
  const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
  for (const student of students) counts[student.status ?? "unmarked"] += 1;
  const session = over.session ?? classSession();
  return {
    term: { id: "018f0000-0000-7000-8000-0000000000f1", name: "Học kỳ 1" },
    rateScope: "term",
    ...over,
    session: {
      ...session,
      hasAttendance: counts.present + counts.late + counts.absent > 0,
    },
    counts,
    students,
  };
}

export type Served = {
  /** The query of every sessions list read, in order. */
  lists: URLSearchParams[];
  /** The body of every save. */
  saves: Mark[][];
  /** The registers by session id, as saved. */
  registers: Map<string, Register>;
};

/**
 * serve answers the class, its sessions lists (from `lists`, by query) and
 * the registers in `registers`, which a save changes as the server would.
 */
export function serve({
  lists,
  registers,
  save,
}: Readonly<{
  lists: (query: URLSearchParams) => Schemas["AttendanceSessionList"];
  registers: Register[];
  save?: (sessionId: string) => Response | null;
}>): Served {
  const served: Served = {
    lists: [],
    saves: [],
    registers: new Map(registers.map((entry) => [entry.session.id, entry])),
  };
  server.use(
    http.get(`${BASE}/teacher/classes/${CLASS_ID}`, () =>
      contractJson("/teacher/classes/{id}", "get", 200, klass),
    ),
    http.get(`${BASE}/teacher/classes/${CLASS_ID}/members`, () =>
      contractJson("/teacher/classes/{id}/members", "get", 200, {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    ),
    http.get(`${BASE}/teacher/assignments`, () =>
      contractJson("/teacher/assignments", "get", 200, {
        items: [],
        page: 1,
        pageSize: 100,
        total: 0,
        facets: { all: 0, draft: 0, scheduled: 0, open: 0, closed: 0 },
      }),
    ),
    http.get(`${BASE}/teacher/attendance/sessions`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      served.lists.push(query);
      return contractJson("/teacher/attendance/sessions", "get", 200, lists(query));
    }),
    http.get(`${BASE}/teacher/sessions/:sessionId/attendance`, ({ params }) => {
      const found = served.registers.get(String(params["sessionId"]));
      if (found === undefined)
        return contractJson("/teacher/sessions/{sessionId}/attendance", "get", 404, {
          error: {
            code: "NOT_FOUND",
            message: "Không tìm thấy.",
            requestId: "018f0000-0000-7000-8000-000000000404",
          },
        });
      return contractJson(
        "/teacher/sessions/{sessionId}/attendance",
        "get",
        200,
        found,
      );
    }),
    http.put(
      `${BASE}/teacher/sessions/:sessionId/attendance`,
      async ({ params, request }) => {
        const id = String(params["sessionId"]);
        const body = (await request.json()) as { marks: Mark[] };
        assertContractRequest("/teacher/sessions/{sessionId}/attendance", "put", body);
        served.saves.push(body.marks);
        const refused = save?.(id) ?? null;
        if (refused !== null) return refused;
        const current = served.registers.get(id)!;
        const students = current.students.map((student) => {
          const mark = body.marks.find(
            (entry) => entry.studentId === student.studentId,
          );
          if (mark === undefined) return student;
          if (mark.status === null) return { ...student, status: null, note: null };
          return {
            ...student,
            status: mark.status,
            note: mark.note === undefined ? student.note : mark.note,
          };
        });
        const saved = register(students, {
          session: current.session,
          term: current.term,
          rateScope: current.rateScope,
        });
        served.registers.set(id, saved);
        return contractJson(
          "/teacher/sessions/{sessionId}/attendance",
          "put",
          200,
          saved,
        );
      },
    ),
  );
  return served;
}

/** failure is an error response of the contract's envelope. */
export function failure(path: string, method: string, status: number, code: string) {
  return contractJson(path, method, status, {
    error: {
      code,
      message: "Từ chối.",
      requestId: "018f0000-0000-7000-8000-000000000001",
    },
  });
}

/** list is a page of the sessions list. */
export function list(
  items: SessionRow[],
  notMarked = 0,
  nextBefore: string | null = null,
) {
  return { items, nextBefore, notMarked };
}
