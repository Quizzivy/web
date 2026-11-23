import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { http, HttpResponse } from "msw";
import CalendarPage from "@/features/calendar/pages/teacher/CalendarPage";
import type { ClassSession } from "@/features/calendar/api";
import {
  attendanceHref,
  nextOccurrence,
  seriesPatch,
  sessionActions,
  sessionPatch,
} from "@/features/calendar/session";
import { Toaster } from "@/components/ui/sonner";
import i18n from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { viewport } from "@tests/support/viewport";
import { contentWidth } from "@tests/support/contentWidth";
import { assistantUser, teacherUser } from "@tests/support/fixtures";
import { deckClass, deckSession, deckWeek } from "@tests/support/calendar";

const BASE = "http://localhost:8080";
/** The deck's now: Wednesday 24 September 2025, 20:15 in Ho Chi Minh City. */
const NOW = new Date("2025-09-24T13:15:00Z");
const MONDAY = "2025-09-22";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

type Calendar = ReturnType<typeof deckWeek>;
type Sent = { method: string; path: string; body: unknown };
let sent: Sent[] = [];
let week: (from: string) => Calendar = (from) => deckWeek(from);

/** A one-off on Saturday afternoon, with a note, as the proposal's "s2". */
const ONE_OFF = deckSession(MONDAY, 5, 14, 1.5, "kids", {
  id: "019535d9-3df7-79fb-b466-fa907fa17f55",
  seriesId: null,
  series: null,
  room: "Phòng 1",
  note: "Học bù cho buổi nghỉ ngày 13 thg 9.",
});

function withOneOff(from: string): Calendar {
  const base = deckWeek(from);
  return {
    ...base,
    sessions: base.sessions.map((session) =>
      session.className === "Kids Starters B" ? ONE_OFF : session,
    ),
  };
}

async function record(request: Request, path: string) {
  const text = await request.text();
  sent.push({ method: request.method, path, body: text ? JSON.parse(text) : null });
}

function serve() {
  server.use(
    http.get(`${BASE}/teacher/calendar`, ({ request }) =>
      contractJson(
        "/teacher/calendar",
        "get",
        200,
        week(new URL(request.url).searchParams.get("from") ?? ""),
      ),
    ),
    http.get(`${BASE}/teacher/classes`, () =>
      contractJson("/teacher/classes", "get", 200, {
        items: [deckClass("evening")],
        page: 1,
        pageSize: 100,
        total: 1,
        facets: { all: 1, joinable: 1, archived: 0, students: 18 },
      }),
    ),
    http.patch(`${BASE}/teacher/sessions/:id`, async ({ request, params }) => {
      await record(request, `/teacher/sessions/${String(params["id"])}`);
      return contractJson(
        "/teacher/sessions/{sessionId}",
        "patch",
        200,
        deckSession(MONDAY, 4, 18, 1.5, "evening"),
      );
    }),
    http.delete(`${BASE}/teacher/sessions/:id`, async ({ request, params }) => {
      await record(request, `/teacher/sessions/${String(params["id"])}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch(`${BASE}/teacher/session-series/:id`, async ({ request, params }) => {
      await record(request, `/teacher/session-series/${String(params["id"])}`);
      const session = deckSession(MONDAY, 4, 18.5, 1.5, "evening");
      return contractJson("/teacher/session-series/{seriesId}", "patch", 200, {
        series: { ...session.series!, startsOn: "2025-09-26" },
        droppedChanges: 2,
      });
    }),
    http.post(`${BASE}/teacher/session-series/:id/end`, async ({ request, params }) => {
      await record(request, `/teacher/session-series/${String(params["id"])}/end`);
      const session = deckSession(MONDAY, 4, 18, 1.5, "evening");
      return contractJson("/teacher/session-series/{seriesId}/end", "post", 200, {
        ...session.series!,
        endsOn: "2025-09-26",
      });
    }),
  );
}

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/teacher/calendar", element: <CalendarPage /> },
      { path: "/teacher/classes/:id", element: <Where /> },
    ],
    { initialEntries: ["/teacher/calendar"] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
}

async function day(name: string) {
  await waitFor(() => expect(document.querySelector("[aria-busy]")).toBeNull());
  return screen.getByRole("group", { name });
}

/** openSession renders the calendar, once, and presses a session in `dayName`'s column. */
async function openSession(dayName: string, event: RegExp) {
  if (document.querySelector("h1") === null) renderPage();
  const user = userEvent.setup();
  const column = await day(dayName);
  const button = within(column).getByRole("button", { name: event });
  await user.click(button);
  const popover = await screen.findByRole("dialog");
  return { user, button, popover };
}

const actionNames = (popover: HTMLElement) =>
  within(popover)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  useAuthStore.setState({ user: teacherUser });
  sent = [];
  week = (from) => deckWeek(from);
  serve();
});

afterEach(async () => {
  useAuthStore.setState({ user: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await act(() => i18n.changeLanguage("vi"));
});

describe("the session popover: what it says", () => {
  it("states a repeating session's class, date, time, room and day, then its four actions", async () => {
    const { popover, button } = await openSession(
      "Th 6, 26 thg 9",
      /IELTS 6.5 Evening/,
    );
    expect(
      within(popover).getByRole("heading", { name: "IELTS 6.5 Evening" }),
    ).toBeVisible();
    expect(popover).toHaveTextContent("Thứ Sáu, 26 tháng 9");
    expect(popover).toHaveTextContent("18:00 – 19:30");
    expect(popover).toHaveTextContent("Phòng 2");
    expect(popover).toHaveTextContent("Mỗi thứ Sáu");
    expect(actionNames(popover)).toEqual([
      "Sửa buổi này",
      "Huỷ buổi này",
      "Sửa lịch lặp lại",
      "Dừng lặp lại",
    ]);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveClass("ring-2");
  });

  it("leads with Điểm danh once the session has started, linking to its class's register", async () => {
    const { popover, user } = await openSession("Th 4, 24 thg 9", /IELTS 6.5 Evening/);
    expect(actionNames(popover)[0]).toBe("Điểm danh");
    const session = deckSession(MONDAY, 2, 18, 1.5, "evening");
    await user.click(within(popover).getByRole("menuitem", { name: "Điểm danh" }));
    expect(screen.getByTestId("where")).toHaveTextContent(attendanceHref(session));
  });

  it("offers a one-off its note, Không lặp lại and Xoá buổi này", async () => {
    week = withOneOff;
    const { popover } = await openSession("Th 7, 27 thg 9", /Kids Starters B/);
    expect(popover).toHaveTextContent("Không lặp lại");
    expect(popover).toHaveTextContent("Học bù cho buổi nghỉ ngày 13 thg 9.");
    expect(actionNames(popover)).toEqual([
      "Sửa buổi này",
      "Huỷ buổi này",
      "Xoá buổi này",
    ]);
  });

  it("marks a cancelled date and a changed one", async () => {
    week = (from) => ({
      ...deckWeek(from),
      sessions: [
        deckSession(from, 3, 17.5, 1.5, "foundation", { cancelled: true }),
        deckSession(from, 4, 18, 1.5, "evening", { changed: true, room: "Phòng 3" }),
      ],
    });
    const first = await openSession("Th 5, 25 thg 9", /IELTS Foundation A/);
    expect(first.popover).toHaveTextContent("Đã huỷ");
    expect(actionNames(first.popover)).toEqual([
      "Khôi phục buổi này",
      "Sửa lịch lặp lại",
      "Dừng lặp lại",
    ]);
    await first.user.keyboard("{Escape}");
    const second = await openSession("Th 6, 26 thg 9", /IELTS 6.5 Evening/);
    expect(second.popover).toHaveTextContent("Đã đổi so với lịch lặp lại");
  });
});

describe("the session popover: the keyboard (DG-36)", () => {
  it("starts on the first action, moves with the arrows, Home and End, and Esc returns focus to the session", async () => {
    const { popover, user, button } = await openSession(
      "Th 6, 26 thg 9",
      /IELTS 6.5 Evening/,
    );
    const items = within(popover).getAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[3]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(items[3]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(button).toHaveFocus();
  });
});

describe("the session popover: each action's request", () => {
  it("Sửa buổi này sends only what changed, and says only this date changes", async () => {
    const { popover, user } = await openSession("Th 6, 26 thg 9", /IELTS 6.5 Evening/);
    await user.click(within(popover).getByRole("menuitem", { name: "Sửa buổi này" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Sửa buổi ngày 26 thg 9",
    });
    expect(dialog).toHaveTextContent("Chỉ buổi này thay đổi. Lịch lặp lại giữ nguyên.");
    const room = within(dialog).getByRole("textbox", { name: "Phòng" });
    expect(room).toHaveValue("Phòng 2");
    await user.clear(room);
    await user.type(room, "Phòng 3");
    await user.type(
      within(dialog).getByRole("textbox", { name: /Ghi chú/ }),
      "Phòng 2 đang sửa",
    );
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: "PATCH",
      path: `/teacher/sessions/${deckSession(MONDAY, 4, 18, 1.5, "evening").id}`,
      body: { room: "Phòng 3", note: "Phòng 2 đang sửa" },
    });
  });

  it("Huỷ buổi này asks with its own two answers, then cancels and toasts", async () => {
    const { popover, user } = await openSession("Th 6, 26 thg 9", /IELTS 6.5 Evening/);
    await user.click(within(popover).getByRole("menuitem", { name: "Huỷ buổi này" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Huỷ buổi ngày 26 thg 9?",
    });
    expect(dialog).toHaveTextContent(
      "Học viên sẽ thấy buổi này là đã huỷ trong Tuần này.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Giữ buổi này" }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Huỷ buổi" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ cancelled: true });
    expect(await screen.findByText("Đã huỷ buổi ngày 26 thg 9")).toBeInTheDocument();
  });

  it("Khôi phục buổi này restores at once and toasts", async () => {
    week = (from) => ({
      ...deckWeek(from),
      sessions: [deckSession(from, 3, 17.5, 1.5, "foundation", { cancelled: true })],
    });
    const { popover, user } = await openSession("Th 5, 25 thg 9", /IELTS Foundation A/);
    await user.click(
      within(popover).getByRole("menuitem", { name: "Khôi phục buổi này" }),
    );
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ cancelled: false });
    expect(
      await screen.findByText("Đã khôi phục buổi ngày 25 thg 9"),
    ).toBeInTheDocument();
  });

  it("Sửa lịch lặp lại starts from the next date, warns, sends the change and counts what it cleared", async () => {
    const { popover, user } = await openSession("Th 6, 26 thg 9", /IELTS 6.5 Evening/);
    await user.click(
      within(popover).getByRole("menuitem", { name: "Sửa lịch lặp lại" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Sửa lịch lặp lại" });
    expect(dialog).toHaveTextContent("IELTS 6.5 Evening · Mỗi thứ Sáu");
    expect(dialog).toHaveTextContent("Các buổi trước ngày 26 thg 9 giữ nguyên.");
    expect(dialog).toHaveTextContent(
      "Những buổi bạn đã sửa hoặc huỷ riêng từ ngày này sẽ theo lịch mới.",
    );
    await user.click(within(dialog).getByRole("button", { name: "120 phút" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    const series = deckSession(MONDAY, 4, 18, 1.5, "evening").series!;
    expect(sent[0]).toEqual({
      method: "PATCH",
      path: `/teacher/session-series/${series.id}`,
      body: { fromDate: "2025-09-26", durationMinutes: 120 },
    });
    expect(
      await screen.findByText(
        "Đã cập nhật lịch lặp lại. 2 thay đổi riêng lẻ đã bị xoá.",
      ),
    ).toBeInTheDocument();
  });

  it("says the change starts tomorrow when today's session has attendance", async () => {
    week = (from) => ({
      ...deckWeek(from),
      sessions: [deckSession(from, 2, 18, 1.5, "evening", { hasAttendance: true })],
    });
    const { popover, user } = await openSession("Th 4, 24 thg 9", /IELTS 6.5 Evening/);
    await user.click(
      within(popover).getByRole("menuitem", { name: "Sửa lịch lặp lại" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Sửa lịch lặp lại" });
    expect(dialog).toHaveTextContent(
      "Buổi hôm nay đã điểm danh, nên thay đổi bắt đầu từ ngày mai.",
    );
    expect(dialog).not.toHaveTextContent("Các buổi trước ngày");
  });

  it("Dừng lặp lại sends the last date, the pressed one by default, and toasts", async () => {
    const { popover, user } = await openSession("Th 6, 26 thg 9", /IELTS 6.5 Evening/);
    await user.click(within(popover).getByRole("menuitem", { name: "Dừng lặp lại" }));
    const dialog = await screen.findByRole("dialog", { name: "Dừng lặp lại" });
    expect(dialog).toHaveTextContent(
      "Các buổi sau ngày này sẽ không còn trên lịch. Buổi đã điểm danh vẫn được giữ.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Dừng lặp lại" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ lastDate: "2025-09-26" });
    expect(
      await screen.findByText("Lịch lặp lại kết thúc sau ngày 26 thg 9"),
    ).toBeInTheDocument();
  });

  it("Xoá buổi này deletes a one-off, and says why when the session has attendance", async () => {
    week = withOneOff;
    let refuse = true;
    server.use(
      http.delete(`${BASE}/teacher/sessions/:id`, async ({ request, params }) => {
        await record(request, `/teacher/sessions/${String(params["id"])}`);
        if (refuse)
          return HttpResponse.json(
            { error: { code: "SESSION_HAS_ATTENDANCE", message: "x", requestId: "r" } },
            { status: 409 },
          );
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { popover, user } = await openSession("Th 7, 27 thg 9", /Kids Starters B/);
    await user.click(within(popover).getByRole("menuitem", { name: "Xoá buổi này" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Xoá buổi ngày 27 thg 9?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Xoá buổi" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Buổi này đã điểm danh nên chỉ có thể huỷ.",
    );
    refuse = false;
    await user.click(within(dialog).getByRole("button", { name: "Xoá buổi" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(sent.map((call) => [call.method, call.path])).toEqual([
      ["DELETE", `/teacher/sessions/${ONE_OFF.id}`],
      ["DELETE", `/teacher/sessions/${ONE_OFF.id}`],
    ]);
  });

  it("opens Cancel when the server says the session belongs to a series", async () => {
    week = withOneOff;
    server.use(
      http.delete(`${BASE}/teacher/sessions/:id`, () =>
        HttpResponse.json(
          { error: { code: "SESSION_IN_SERIES", message: "x", requestId: "r" } },
          { status: 409 },
        ),
      ),
    );
    const { popover, user } = await openSession("Th 7, 27 thg 9", /Kids Starters B/);
    await user.click(within(popover).getByRole("menuitem", { name: "Xoá buổi này" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Xoá buổi" }));
    expect(
      await screen.findByRole("dialog", { name: "Huỷ buổi ngày 27 thg 9?" }),
    ).toBeInTheDocument();
  });
});

describe("the session popover on a phone", () => {
  it("is a sheet from the agenda, with 44px actions", async () => {
    viewport("phone");
    contentWidth(360);
    renderPage();
    const user = userEvent.setup();
    const today = await screen.findByRole("heading", { level: 2, name: /Hôm nay/ });
    const list = today.nextElementSibling as HTMLElement;
    const row = within(list).getByRole("button", { name: /IELTS 6.5 Evening/ });
    await user.click(row);
    const sheet = await screen.findByRole("dialog", { name: "IELTS 6.5 Evening" });
    expect(sheet).toHaveClass("bottom-0", "rounded-t-3xl");
    expect(within(sheet).getAllByRole("menuitem")[0]).toHaveClass("h-11");
    expect(row).toHaveClass("bg-muted");
  });
});

describe("the session popover beside the agenda", () => {
  it("is a sheet wherever the week is the agenda, a 768px window with the sidebar open too", async () => {
    viewport(768);
    contentWidth(464);
    renderPage();
    const user = userEvent.setup();
    const today = await screen.findByRole("heading", { level: 2, name: /Hôm nay/ });
    const list = today.nextElementSibling as HTMLElement;
    await user.click(within(list).getByRole("button", { name: /IELTS 6.5 Evening/ }));
    expect(
      await screen.findByRole("dialog", { name: "IELTS 6.5 Evening" }),
    ).toHaveClass("bottom-0");
  });
});

describe("the session popover's rules", () => {
  const session: ClassSession = deckSession(MONDAY, 4, 18, 1.5, "evening");
  const now = NOW.getTime();

  it("offers nothing that changes the class without teaching.classes.write", () => {
    expect(sessionActions(session, now, { write: false, attend: true })).toEqual([]);
    const begun = deckSession(MONDAY, 0, 18, 1.5, "evening");
    expect(sessionActions(begun, now, { write: false, attend: true })).toEqual([
      "attendance",
    ]);
    expect(sessionActions(begun, now, { write: true, attend: false })[0]).toBe(
      "editDate",
    );
    expect(assistantUser.permissions).not.toContain("teaching.classes.write");
  });

  it("never offers attendance on a cancelled date, nor Delete on a one-off with attendance", () => {
    const begun = deckSession(MONDAY, 0, 18, 1.5, "evening", { cancelled: true });
    expect(sessionActions(begun, now, { write: true, attend: true })).toEqual([
      "restore",
      "editSeries",
      "stop",
    ]);
    expect(
      sessionActions({ ...ONE_OFF, hasAttendance: true }, now, {
        write: true,
        attend: true,
      }),
    ).toEqual(["editDate", "cancel"]);
  });

  it("starts a change from the series' next date, today included", () => {
    const series = session.series!;
    expect(nextOccurrence(series, "2025-09-24")).toBe("2025-09-26");
    expect(nextOccurrence(series, "2025-09-26")).toBe("2025-09-26");
    expect(nextOccurrence(series, "2025-09-27")).toBe("2025-10-03");
  });

  it("sends nothing when nothing changed, and null for an emptied room", () => {
    const before = {
      date: "2025-09-26",
      time: "18:00",
      dur: "90",
      room: "Phòng 2",
      note: "",
    };
    expect(sessionPatch(before, before)).toBeNull();
    expect(sessionPatch(before, { ...before, room: " " })).toEqual({ room: null });
    const from = {
      from: "2025-09-26",
      weekday: "5",
      time: "18:00",
      dur: "90",
      room: "",
    };
    expect(seriesPatch(from, from)).toBeNull();
    expect(seriesPatch(from, { ...from, weekday: "6" })).toEqual({
      fromDate: "2025-09-26",
      weekday: 6,
    });
  });
});
