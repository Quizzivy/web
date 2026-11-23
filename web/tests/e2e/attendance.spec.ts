import { expect, test, type Page, type Route } from "@playwright/test";
import type { components } from "@/lib/api/schema";
import { adminUser, sessionAs, stubApi } from "./support/api";
import { dashboard23Summary } from "../support/dashboard23";
import { assertContractRequest, contractJson } from "../support/contractResponse";

/**
 * Attendance (T-R8.12, T-R8.16) in the built app: from the Attendance page to
 * a class's register, marking, saving, and changing the session. The stubs
 * answer as the server would, every answer checked against the contract
 * before it is sent and every save's body before it is taken. The clock is
 * the deck's: Thursday 24 September 2026, 20:15 in Ho Chi Minh City, two
 * hours after IELTS 6.5 Evening began.
 */

type Schemas = components["schemas"];
type Register = Schemas["SessionAttendance"];
type Student = Schemas["AttendanceStudent"];
type Mark = Schemas["AttendanceMarkInput"];
type SessionRow = Schemas["AttendanceSessionRow"];

const NOW = new Date("2026-09-24T13:15:00Z");
const API = "http://localhost:8080";
const CLASS_ID = "018f0000-0000-7000-8000-0000000000c1";
/** The class meets on Tuesdays and Thursdays at 18:00, a weekly series for each. */
const TUESDAYS = "018f0000-0000-7000-8000-0000000000b2";
const THURSDAYS = "018f0000-0000-7000-8000-0000000000b4";
const TODAY_ID = `${THURSDAYS}.20260924`;
const TUESDAY_ID = `${TUESDAYS}.20260922`;
const TERM = { id: "018f0000-0000-7000-8000-0000000000f1", name: "Học kỳ 1" };

const ANH = "018f0000-0000-7000-8000-0000000000e1";
const NAM = "018f0000-0000-7000-8000-0000000000e2";
const BAO = "018f0000-0000-7000-8000-0000000000e3";
const HA = "018f0000-0000-7000-8000-0000000000e4";

const klass: Schemas["Class"] = {
  id: CLASS_ID,
  name: "IELTS 6.5 Evening",
  description: null,
  scheduleLabel: null,
  room: "Phòng 2",
  ownRoom: "Phòng 2",
  schedule: {
    slots: [
      { weekday: 2, startTime: "18:00", durationMinutes: 90 },
      { weekday: 4, startTime: "18:00", durationMinutes: 90 },
    ],
    label: null,
  },
  studentCount: 4,
  openAssignmentCount: 0,
  archivedAt: null,
  selfJoinEnabled: true,
  joinCode: null,
  createdAt: "2026-06-01T00:00:00Z",
};

function session(id: string, startsAt: string): Schemas["ClassSession"] {
  const seriesId = id.split(".")[0]!;
  return {
    id,
    classId: CLASS_ID,
    className: klass.name,
    seriesId,
    series: {
      id: seriesId,
      classId: CLASS_ID,
      weekday: seriesId === TUESDAYS ? 2 : 4,
      startTime: "18:00",
      durationMinutes: 90,
      room: "Phòng 2",
      startsOn: "2026-09-01",
      endsOn: "2026-12-20",
      timeZone: "Asia/Ho_Chi_Minh",
    },
    date: startsAt.slice(0, 10),
    startsAt,
    durationMinutes: 90,
    room: "Phòng 2",
    note: null,
    cancelled: false,
    changed: false,
    hasAttendance: false,
  };
}

const STARTS: Record<string, string> = {
  [TODAY_ID]: "2026-09-24T11:00:00Z",
  [TUESDAY_ID]: "2026-09-22T11:00:00Z",
};

function roster(status: (index: number) => Student["status"] = () => null): Student[] {
  return [
    { studentId: ANH, fullName: "Trần Minh Anh", rate: 100 },
    { studentId: NAM, fullName: "Lê Hoàng Nam", rate: 92 },
    { studentId: BAO, fullName: "Nguyễn Gia Bảo", rate: 85 },
    { studentId: HA, fullName: "Phạm Thu Hà", rate: null },
  ].map((student, index) => ({
    ...student,
    avatarUrl: null,
    status: status(index),
    note: null,
  }));
}

/** register is a session's register, its counts worked out from its roster. */
function register(id: string, students: Student[]): Register {
  const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
  for (const student of students) counts[student.status ?? "unmarked"] += 1;
  return {
    session: {
      ...session(id, STARTS[id]!),
      hasAttendance: counts.present + counts.late + counts.absent > 0,
    },
    term: TERM,
    rateScope: "term",
    counts,
    students,
  };
}

function row(entry: Register): SessionRow {
  const { present, late, absent } = entry.counts;
  return {
    id: entry.session.id,
    classId: CLASS_ID,
    className: klass.name,
    room: entry.session.room,
    startsAt: entry.session.startsAt,
    marked: entry.session.hasAttendance,
    studentCount: entry.students.length,
    counts: entry.session.hasAttendance ? { present, late, absent } : null,
  };
}

async function contract(
  route: Route,
  path: string,
  method: string,
  status: number,
  body: unknown,
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(await contractJson(path, method, status, body).json()),
  });
}

/**
 * prepare serves the class, its sessions lists and two registers: today's,
 * nobody marked, and Tuesday's, saved with Nam late. A save changes its
 * register as the server would, and the lists follow.
 */
async function prepare(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => localStorage.setItem("quizzivy.theme", "light"));
  const saves: Mark[][] = [];
  const registers = new Map<string, Register>([
    [TODAY_ID, register(TODAY_ID, roster())],
    [
      TUESDAY_ID,
      register(
        TUESDAY_ID,
        roster((i) => (i === 1 ? "late" : "present")),
      ),
    ],
  ]);
  const rows = (query: URLSearchParams) => {
    const all = [...registers.values()]
      .map(row)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .filter((item) => {
        const since = query.get("since");
        const before = query.get("before");
        const marked = query.get("marked");
        return (
          (since === null || item.startsAt >= since) &&
          (before === null || item.startsAt < before) &&
          (marked === null || String(item.marked) === marked)
        );
      });
    const limit = Number(query.get("limit") ?? 20);
    return {
      items: all.slice(0, limit),
      nextBefore: null,
      notMarked: [...registers.values()].filter((entry) => !entry.session.hasAttendance)
        .length,
    };
  };

  await stubApi(page, {
    ...sessionAs(adminUser),
    "GET /teacher/summary": { body: dashboard23Summary() },
    "GET /me/summary": { body: { unreadNotifications: 0, unreadMessages: 0 } },
    [`GET /teacher/classes/${CLASS_ID}`]: (route) =>
      contract(route, "/teacher/classes/{id}", "get", 200, klass),
    [`GET /teacher/classes/${CLASS_ID}/members`]: (route) =>
      contract(route, "/teacher/classes/{id}/members", "get", 200, {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    "GET /teacher/assignments": (route) =>
      contract(route, "/teacher/assignments", "get", 200, {
        items: [],
        page: 1,
        pageSize: 100,
        total: 0,
        facets: { all: 0, draft: 0, scheduled: 0, open: 0, closed: 0 },
      }),
    "GET /teacher/attendance/sessions": (route) =>
      contract(
        route,
        "/teacher/attendance/sessions",
        "get",
        200,
        rows(new URL(route.request().url()).searchParams),
      ),
  });
  await page.route(`${API}/teacher/sessions/*/attendance`, async (route) => {
    const request = route.request();
    const id = decodeURIComponent(new URL(request.url()).pathname.split("/")[3] ?? "");
    const current = registers.get(id);
    if (current === undefined) {
      await route.fulfill({ status: 404 });
      return;
    }
    const path = "/teacher/sessions/{sessionId}/attendance";
    if (request.method() === "GET") {
      await contract(route, path, "get", 200, current);
      return;
    }
    const body = request.postDataJSON() as { marks: Mark[] };
    assertContractRequest(path, "put", body);
    saves.push(body.marks);
    const students = current.students.map((student) => {
      const mark = body.marks.find((entry) => entry.studentId === student.studentId);
      if (mark === undefined) return student;
      return mark.status === null
        ? { ...student, status: null, note: null }
        : { ...student, status: mark.status, note: mark.note ?? student.note };
    });
    const saved = register(id, students);
    registers.set(id, saved);
    await contract(route, path, "put", 200, saved);
  });
  return saves;
}

const roll = (page: Page) => page.getByRole("list", { name: "Học viên" });
const radio = (page: Page, name: string, status: "Có mặt" | "Muộn" | "Vắng") =>
  roll(page)
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("radio", { name: status });

test("mark, save and change session: from the Attendance page to the register and back to another date", async ({
  page,
}) => {
  const saves = await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/teacher/attendance");

  // Today's card lists the session that has begun; the recent one is saved.
  const today = page.getByRole("region", { name: "Hôm nay · Th 5, 24 thg 9" });
  await expect(today.getByRole("listitem")).toHaveCount(1);
  await expect(today).toContainText("Phòng 2 · 4 học viên");
  await expect(today).toContainText("Chưa điểm danh");
  await expect(page.getByRole("region", { name: "Gần đây" })).toContainText(
    "3 có mặt · 1 muộn · 0 vắng",
  );
  await today.getByRole("link", { name: "Điểm danh IELTS 6.5 Evening, 18:00" }).click();
  await expect(page).toHaveURL(
    `/teacher/classes/${CLASS_ID}?tab=attendance&session=${encodeURIComponent(TODAY_ID)}`,
  );

  // Mark: three of the four, each mark a radio of its row.
  await expect(roll(page).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("0/4 đã đánh dấu")).toBeVisible();
  await radio(page, "Trần Minh Anh", "Có mặt").click();
  await radio(page, "Lê Hoàng Nam", "Muộn").click();
  await radio(page, "Nguyễn Gia Bảo", "Vắng").click();
  await expect(radio(page, "Lê Hoàng Nam", "Muộn")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText("3/4 đã đánh dấu")).toBeVisible();
  await expect(
    page.getByText("3 thay đổi chưa lưu · 1 học viên chưa đánh dấu"),
  ).toBeVisible();

  // Save: one left unmarked, so it asks first, and saves only the marks made.
  await page.getByRole("button", { name: "Lưu điểm danh" }).click();
  const ask = page.getByRole("dialog", {
    name: "Lưu khi còn 1 học viên chưa đánh dấu?",
  });
  await expect(ask).toContainText("không được tính vào tỉ lệ điểm danh");
  expect(saves).toEqual([]);
  await ask.getByRole("button", { name: "Vẫn lưu" }).click();
  await expect(page.getByText("Đã lưu điểm danh · 1 vắng, 1 muộn")).toBeVisible();
  expect(saves).toEqual([
    [
      { studentId: ANH, status: "present" },
      { studentId: NAM, status: "late" },
      { studentId: BAO, status: "absent" },
    ],
  ]);
  await expect(page.getByText("Đã lưu 20:15")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu điểm danh" })).toBeHidden();

  // Change session: Tuesday's register, saved, from the picker.
  await page
    .getByRole("button", { name: "Chọn buổi học: Th 5, 24 thg 9 · 18:00" })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemradio")).toHaveText([
    /^Th 5, 24 thg 9 · 18:00\s*Hôm nay$/,
    /^Th 3, 22 thg 9 · 18:00\s*Đã lưu$/,
  ]);
  await menu.getByRole("menuitemradio", { name: /22 thg 9/ }).click();
  await expect(page).toHaveURL(new RegExp(`session=${encodeURIComponent(TUESDAY_ID)}`));
  await expect(page.getByText("Đã đánh dấu đủ 4")).toBeVisible();
  await expect(radio(page, "Lê Hoàng Nam", "Muộn")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // A mark left unsaved is asked about before the session changes again.
  await radio(page, "Phạm Thu Hà", "Vắng").click();
  await page
    .getByRole("button", { name: "Chọn buổi học: Th 3, 22 thg 9 · 18:00" })
    .click();
  await page.getByRole("menuitemradio", { name: /24 thg 9/ }).click();
  const leave = page.getByRole("dialog", { name: "Bỏ điểm danh chưa lưu?" });
  await leave.getByRole("button", { name: "Bỏ thay đổi" }).click();
  await expect(page).toHaveURL(new RegExp(`session=${encodeURIComponent(TODAY_ID)}`));
  await expect(page.getByText("3/4 đã đánh dấu")).toBeVisible();
  await expect(radio(page, "Nguyễn Gia Bảo", "Vắng")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(saves).toHaveLength(1);

  // Back on the Attendance page, today's session reads as saved.
  await page.goto("/teacher/attendance");
  await expect(
    page.getByRole("region", { name: "Hôm nay · Th 5, 24 thg 9" }),
  ).toContainText("1 có mặt · 1 muộn · 1 vắng");
});
