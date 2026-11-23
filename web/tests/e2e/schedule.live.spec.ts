import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { components } from "@/lib/api/schema";
import { STAFF_HOST, STUDENT_HOST } from "./support/hosts";
import {
  API,
  apiResponse,
  centreDay,
  MINH_ANH,
  sharedApiAuth,
  signIn,
  TEACHER,
} from "./support/live";

/**
 * The schedule end to end (R8, T-R8.16) against the real API, on the two
 * hosts as they ship: a teacher adds a repeating session on the staff host,
 * changes one date of it, and takes its attendance; the student reads the
 * week on the student host; and the public join preview, for a class with no
 * room of its own, answers exactly its five keys with the weekly slot and the
 * room derived from the series, never the date's own. It is live because
 * that derivation happens on the server, which no stub can stand for.
 *
 * The class is the spec's own, made through the API and archived at the end,
 * its one student seed/08's Trần Minh Anh, who joins it with its code,
 * so the seeded timetable (seed/13) and other runs stay as they were. The
 * session starts at 00:00 today in Ho Chi Minh City, so it has always begun
 * by the time attendance is taken, whatever the hour of the run.
 */

type ClassSession = components["schemas"]["ClassSession"];
type StudentWeek = components["schemas"]["StudentWeek"];
type WeekSessionItem = components["schemas"]["WeekSessionItem"];
type Register = components["schemas"]["SessionAttendance"];

const SERIES_ROOM = "Phòng 7";
const DATE_ROOM = "Phòng 9";
const DATE_NOTE = "Phòng 9 tuần này";
/** The vi weekdays the schedule line writes, Monday first. */
const WEEKDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** sessionsOf is the spec's class's sessions on a day of the student's week. */
function sessionsOf(week: StudentWeek, date: string, className: string) {
  return (week.days.find((day) => day.date === date)?.items ?? []).filter(
    (item): item is WeekSessionItem =>
      item.kind === "session" && item.className === className,
  );
}

/** readWeek opens This week (with `start`, the week holding it) and answers its payload. */
async function readWeek(page: Page, start?: string) {
  const read = apiResponse(page, "GET", "/app/week");
  const query = start === undefined ? "" : `?start=${start}`;
  await page.goto(`${STUDENT_HOST}/week${query}`);
  const response = await read;
  expect(response.status()).toBe(200);
  return (await response.json()) as StudentWeek;
}

async function archive(
  api: APIRequestContext,
  lan: Record<string, string>,
  id: string,
) {
  const archived = await api.patch(`${API}/teacher/classes/${id}`, {
    headers: lan,
    data: { archived: true },
  });
  expect(archived.status(), await archived.text()).toBe(200);
}

test("a teacher's repeating session reaches the student's week, its attendance and the join preview", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(150_000);
  const api = await playwright.request.newContext();
  const lan = await sharedApiAuth(api, TEACHER);
  const today = centreDay();
  const nextWeek = centreDay(7);
  const className = `Lịch tuần ${Date.now()}`;

  // The class has no room of its own: the preview's room can only be the series'.
  const created = await api.post(`${API}/teacher/classes`, {
    headers: lan,
    data: { name: className },
  });
  expect(created.status(), await created.text()).toBe(201);
  const classId = ((await created.json()) as { id: string }).id;
  const teacher = await browser.newPage();
  const student = await browser.newPage();
  const visitor = await browser.newContext();
  try {
    const issued = await api.post(`${API}/teacher/classes/${classId}/join-code`, {
      headers: lan,
      data: {},
    });
    expect(issued.status(), await issued.text()).toBe(201);
    const joinCode = ((await issued.json()) as { code: string }).code;
    const joined = await api.post(`${API}/app/classes/join`, {
      headers: await sharedApiAuth(api, MINH_ANH),
      data: { joinCode },
    });
    expect(joined.status(), await joined.text()).toBe(200);

    let occurrence: ClassSession | undefined;
    await test.step("1. the teacher adds a repeating session in the Calendar", async () => {
      await signIn(teacher, TEACHER, /\/teacher$/, STAFF_HOST);
      await teacher.goto(`${STAFF_HOST}/teacher/calendar`);
      const week = teacher.getByRole("region", {
        name: await teacher.getByRole("heading", { level: 1 }).innerText(),
      });
      await expect(week).not.toHaveAttribute("aria-busy", "true");

      await teacher.getByRole("button", { name: "Buổi học", exact: true }).click();
      const dialog = teacher.getByRole("dialog", { name: "Buổi học mới" });
      await dialog.getByRole("combobox", { name: "Lớp" }).click();
      await teacher.getByRole("option", { name: className, exact: true }).click();
      await dialog.getByRole("textbox", { name: "Phòng" }).fill(SERIES_ROOM);
      await dialog.getByRole("button", { name: "Bắt đầu 18:00" }).click();
      const clock = teacher.getByRole("dialog", { name: "Chọn giờ" });
      for (let hour = 18; hour > 0; hour--)
        await clock.getByRole("button", { name: "Giảm giờ" }).click();
      await clock.getByRole("button", { name: "Xong" }).click();
      await expect(dialog.getByRole("button", { name: "Bắt đầu 00:00" })).toBeVisible();
      await expect(
        dialog.getByRole("switch", { name: "Lặp lại mỗi tuần" }),
      ).toBeChecked();
      // seed/13's Term 3 holds today, so the series runs to its end.
      await expect(dialog).toContainText(/Đến hết \d+ thg \d+/);

      const posted = apiResponse(
        teacher,
        "POST",
        `/teacher/classes/${classId}/sessions`,
      );
      await dialog.getByRole("button", { name: "Thêm buổi học" }).click();
      const response = await posted;
      expect(response.status()).toBe(201);
      occurrence = (await response.json()) as ClassSession;
      expect(occurrence).toMatchObject({
        classId,
        date: today.date,
        durationMinutes: 90,
        room: SERIES_ROOM,
        changed: false,
        series: { weekday: today.weekday, startTime: "00:00", room: SERIES_ROOM },
      });
      expect(occurrence.series?.endsOn, "the end of Term 3").not.toBeNull();
      await expect(
        teacher.getByText(`Đã thêm buổi học · ${className}, 00:00`),
      ).toBeVisible();

      // Today's column draws it; one date of it moves to another room, with a note.
      const block = week
        .locator("[aria-current='date']")
        .getByRole("button", { name: `${className} 00:00 – 01:30` });
      await block.click();
      const popover = teacher.getByRole("dialog", { name: className });
      await popover.getByRole("menuitem", { name: "Sửa buổi này" }).click();
      const edit = teacher.getByRole("dialog", { name: /^Sửa buổi ngày / });
      await expect(edit.getByRole("textbox", { name: "Phòng" })).toHaveValue(
        SERIES_ROOM,
      );
      await edit.getByRole("textbox", { name: "Phòng" }).fill(DATE_ROOM);
      await edit.getByRole("textbox", { name: /Ghi chú/ }).fill(DATE_NOTE);
      const patched = apiResponse(
        teacher,
        "PATCH",
        `/teacher/sessions/${occurrence.id}`,
      );
      await edit.getByRole("button", { name: "Lưu", exact: true }).click();
      const change = await patched;
      expect(change.status()).toBe(200);
      expect(await change.json()).toMatchObject({
        id: occurrence.id,
        room: DATE_ROOM,
        note: DATE_NOTE,
        changed: true,
        series: { room: SERIES_ROOM },
      });
      await expect(edit).toBeHidden();
    });

    await test.step("2. the student sees it in This week, with the date's change", async () => {
      await signIn(student, MINH_ANH, /\/$/, STUDENT_HOST);
      const week = await readWeek(student);
      expect(sessionsOf(week, today.date, className)).toEqual([
        {
          kind: "session",
          classId,
          className,
          startsAt: occurrence!.startsAt,
          durationMinutes: 90,
          room: DATE_ROOM,
          note: DATE_NOTE,
          cancelled: false,
        },
      ]);
      const day = student.locator(`section[data-date='${today.date}']`);
      await expect(day.getByRole("heading", { level: 2 })).toHaveAttribute(
        "aria-current",
        "date",
      );
      const row = day.getByRole("link").filter({ hasText: className });
      await expect(row).toContainText(DATE_NOTE);
      await expect(row).toContainText("00:00");
      await expect(row).toHaveAttribute("href", "/classes");

      // The change is that date's alone: next week meets in the series' room.
      const following = await readWeek(student, nextWeek.date);
      expect(sessionsOf(following, nextWeek.date, className)).toMatchObject([
        { room: SERIES_ROOM, note: null, cancelled: false },
      ]);
      await expect(
        student
          .locator(`section[data-date='${nextWeek.date}']`)
          .getByRole("link")
          .filter({ hasText: className }),
      ).toContainText(`${SERIES_ROOM} · 90 phút`);
    });

    await test.step("3. the teacher takes attendance from the Attendance page", async () => {
      await teacher.goto(`${STAFF_HOST}/teacher/attendance`);
      const card = teacher.getByRole("region", { name: /^Hôm nay · / });
      await card.getByRole("link", { name: `Điểm danh ${className}, 00:00` }).click();
      await expect(teacher).toHaveURL(
        `${STAFF_HOST}/teacher/classes/${classId}?tab=attendance&session=${encodeURIComponent(occurrence!.id)}`,
      );
      const roll = teacher.getByRole("list", { name: "Học viên" });
      await expect(roll.getByRole("listitem")).toHaveCount(1);
      await roll
        .getByRole("listitem")
        .filter({ hasText: "Trần Minh Anh" })
        .getByRole("radio", { name: "Có mặt" })
        .click();
      await expect(teacher.getByText("Đã đánh dấu đủ 1")).toBeVisible();

      const saved = apiResponse(
        teacher,
        "PUT",
        `/teacher/sessions/${occurrence!.id}/attendance`,
      );
      await teacher.getByRole("button", { name: "Lưu điểm danh" }).click();
      const response = await saved;
      expect(response.status()).toBe(200);
      const register = (await response.json()) as Register;
      expect(register.rateScope).toBe("term");
      expect(register.counts).toEqual({ present: 1, late: 0, absent: 0, unmarked: 0 });
      expect(register.session).toMatchObject({ room: DATE_ROOM, hasAttendance: true });
      expect(register.students).toMatchObject([
        { fullName: "Trần Minh Anh", status: "present", rate: 100 },
      ]);
      await expect(
        teacher.getByText("Đã lưu điểm danh · 0 vắng, 0 muộn"),
      ).toBeVisible();
    });

    await test.step("4. /join/preview answers exactly five keys, with the slot and the series' room", async () => {
      const page = await visitor.newPage();
      const previewed = page.waitForResponse(
        (response) =>
          response.url() === `${API}/join/preview` &&
          response.request().method() === "POST",
      );
      await page.goto(`${STUDENT_HOST}/join/${joinCode}`);
      const response = await previewed;
      expect(response.status()).toBe(200);
      const preview = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(preview).sort((a, b) => a.localeCompare(b))).toEqual([
        "classId",
        "className",
        "room",
        "schedule",
        "teacherName",
      ]);
      expect(preview).toEqual({
        classId,
        className,
        teacherName: "Trần Thị Lan",
        schedule: {
          slots: [{ weekday: today.weekday, startTime: "00:00", durationMinutes: 90 }],
          label: null,
        },
        room: SERIES_ROOM,
      });
      // The card a student opens the link to: the slot and the room, not the date's.
      await expect(page.getByText(className, { exact: true })).toBeVisible();
      await expect(
        page.getByText(`${WEEKDAY[today.weekday - 1]}, 00:00 · ${SERIES_ROOM}`),
      ).toBeVisible();
      await expect(page.getByText(DATE_ROOM)).toHaveCount(0);
    });
  } finally {
    await visitor.close();
    await teacher.close();
    await student.close();
    await archive(api, lan, classId);
    await api.dispose();
  }
});
