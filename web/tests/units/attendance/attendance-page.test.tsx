import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { useAuthStore } from "@/stores/auth";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import {
  BASE,
  MONDAY_ID,
  OTHER_CLASS_ID,
  TODAY_ID,
  TUESDAY_ID,
  failure,
  list,
  occurrence,
  serve,
  sessionRow,
  today,
  type SessionRow,
} from "./support";
import { renderAttendance } from "./render";

const MIDNIGHT = "2026-09-23T17:00:00.000Z";
const WEEK_AGO = "2026-09-16T17:00:00.000Z";

const TODAYS = sessionRow();
const OWED = sessionRow({
  id: TUESDAY_ID,
  classId: OTHER_CLASS_ID,
  className: "IELTS Foundation A",
  room: "Phòng 1",
  startsAt: "2026-09-23T10:30:00Z",
  studentCount: 18,
});
const SAVED = [
  sessionRow({
    id: MONDAY_ID,
    startsAt: "2026-09-22T11:00:00Z",
    marked: true,
    counts: { present: 22, late: 1, absent: 1 },
  }),
  sessionRow({
    id: occurrence("20260920"),
    classId: OTHER_CLASS_ID,
    className: "TOEIC 600 Weekend",
    room: null,
    startsAt: "2026-09-20T02:00:00Z",
    marked: true,
    counts: { present: 15, late: 0, absent: 1 },
  }),
];

/** card is one of the page's three cards, by its title. */
const card = (title: string) => screen.getByRole("region", { name: title });

/** lists answers each card's query with `rows`. */
function lists(rows: {
  today: SessionRow[];
  owed: SessionRow[];
  recent: SessionRow[];
}) {
  return (query: URLSearchParams) => {
    if (query.get("marked") === "false") return list(rows.owed, 1);
    if (query.get("marked") === "true") return list(rows.recent, 1);
    return list(rows.today, 1);
  };
}

beforeEach(() => {
  today();
  useAuthStore.setState({ user: teacherUser });
});

afterEach(() => {
  vi.useRealTimers();
  useAuthStore.setState({ user: null });
});

describe("the Attendance page", () => {
  it("asks for today's started sessions, the past ones with no register and the last seven days' saved ones", async () => {
    const served = serve({
      lists: lists({ today: [TODAYS], owed: [OWED], recent: SAVED }),
      registers: [],
    });
    renderAttendance();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Điểm danh" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Điểm danh cho các lớp hôm nay, hoặc bổ sung cho những buổi bạn bỏ sót.",
      ),
    ).toBeVisible();
    await waitFor(() => expect(served.lists).toHaveLength(3));
    const asked = served.lists.map((query) => Object.fromEntries(query));
    expect(asked).toEqual(
      expect.arrayContaining([
        { since: MIDNIGHT, limit: "20" },
        { before: MIDNIGHT, marked: "false", limit: "20" },
        { since: WEEK_AGO, before: MIDNIGHT, marked: "true", limit: "20" },
      ]),
    );
  });

  it("draws the three cards as the deck does, each row opening its class's Attendance tab on the session", async () => {
    serve({
      lists: lists({ today: [TODAYS], owed: [OWED], recent: SAVED }),
      registers: [],
    });
    renderAttendance();

    const todayCard = await waitFor(() => card("Hôm nay · Th 5, 24 thg 9"));
    expect(await within(todayCard).findByText("1 lớp")).toBeVisible();
    const todayRows = await within(todayCard).findAllByRole("listitem");
    expect(todayRows).toHaveLength(1);
    const first = within(todayRows[0]!);
    expect(first.getByText("18:00")).toBeVisible();
    expect(first.getByText("Hôm nay")).toBeVisible();
    expect(first.getByText("IELTS 6.5 Evening")).toBeVisible();
    expect(first.getByText("Phòng 2 · 24 học viên")).toBeVisible();
    expect(first.getByText("Chưa điểm danh")).toBeVisible();
    expect(
      first.getByRole("link", { name: "Điểm danh IELTS 6.5 Evening, 18:00" }),
    ).toHaveAttribute(
      "href",
      `/teacher/classes/018f0000-0000-7000-8000-0000000000c1?tab=attendance&session=${encodeURIComponent(TODAY_ID)}`,
    );

    const owed = within(card("Cần điểm danh"));
    expect(owed.getByText("Buổi đã qua mà chưa điểm danh")).toBeVisible();
    expect(await owed.findByText("Th 4, 23 thg 9")).toBeVisible();
    expect(owed.getByText("17:30")).toBeVisible();
    expect(owed.getByText("Phòng 1 · 18 học viên")).toBeVisible();
    expect(owed.getByText("Bỏ sót")).toBeVisible();
    expect(
      owed.getByRole("link", { name: /^Điểm danh IELTS Foundation A/ }),
    ).toHaveAttribute(
      "href",
      `/teacher/classes/${OTHER_CLASS_ID}?tab=attendance&session=${encodeURIComponent(TUESDAY_ID)}`,
    );

    const recent = within(card("Gần đây"));
    expect(recent.getByText("7 ngày qua")).toBeVisible();
    const saved = await recent.findAllByRole("listitem");
    expect(saved.map((row) => row.textContent)).toEqual([
      "18:00Th 3, 22 thg 9IELTS 6.5 Evening22 có mặt · 1 muộn · 1 vắngĐã lưuMở",
      "09:00CN, 20 thg 9TOEIC 600 Weekend15 có mặt · 0 muộn · 1 vắngĐã lưuMở",
    ]);
    expect(
      within(saved[0]!).getByRole("link", { name: "Mở IELTS 6.5 Evening, 18:00" }),
    ).toBeVisible();
  });

  it("keeps each card with its own sentence when it has nothing, today's saying none has started (O-R8.6)", async () => {
    serve({ lists: lists({ today: [], owed: [], recent: [] }), registers: [] });
    renderAttendance();

    expect(
      await within(card("Hôm nay · Th 5, 24 thg 9")).findByText(
        "Hôm nay chưa có lớp nào bắt đầu.",
      ),
    ).toBeVisible();
    expect(within(card("Hôm nay · Th 5, 24 thg 9")).getByText("0 lớp")).toBeVisible();
    expect(within(card("Cần điểm danh")).getByText("Đã điểm danh đủ.")).toBeVisible();
    expect(within(card("Gần đây")).getByText("Chưa có gì.")).toBeVisible();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("shows blocks in each card while the lists load", async () => {
    server.use(
      http.get(
        `${BASE}/teacher/attendance/sessions`,
        () => new Promise(() => undefined),
      ),
    );
    renderAttendance();
    await waitFor(() =>
      expect(screen.getAllByRole("status", { name: "Đang tải…" })).toHaveLength(3),
    );
    expect(card("Cần điểm danh")).toBeVisible();
  });

  it("says once, with Retry, when a list cannot be read, and reads it again", async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/teacher/attendance/sessions`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        if (fail && query.get("marked") === "false")
          return failure("/teacher/attendance/sessions", "get", 404, "NOT_FOUND");
        return contractJson(
          "/teacher/attendance/sessions",
          "get",
          200,
          lists({ today: [TODAYS], owed: [OWED], recent: [] })(query),
        );
      }),
    );
    const { user } = renderAttendance();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Không tải được danh sách buổi học.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Cần điểm danh" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Điểm danh" })).toBeVisible();

    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("IELTS Foundation A")).toBeVisible();
  });
});
