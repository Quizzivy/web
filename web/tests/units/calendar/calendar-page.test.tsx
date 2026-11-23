import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { http, HttpResponse } from "msw";
import CalendarPage from "@/features/calendar/pages/teacher/CalendarPage";
import { Toaster } from "@/components/ui/sonner";
import i18n from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { contentWidth } from "@tests/support/contentWidth";
import { viewport } from "@tests/support/viewport";
import { assistantUser, teacherUser } from "@tests/support/fixtures";
import {
  DECK_ASSIGNMENTS,
  deckClass,
  deckSession,
  deckWeek,
} from "@tests/support/calendar";

const BASE = "http://localhost:8080";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
/** The deck's now: Wednesday 24 September 2025, 20:15 in Ho Chi Minh City. */
const NOW = new Date("2025-09-24T13:15:00Z");

type Calendar = ReturnType<typeof deckWeek>;

let reads: URLSearchParams[] = [];

function serveWeeks(answer: (from: string) => Calendar | "fail") {
  server.use(
    http.get(`${BASE}/teacher/calendar`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      reads.push(query);
      const body = answer(query.get("from") ?? "");
      if (body === "fail")
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "boom", requestId: "req-1" } },
          { status: 500 },
        );
      return contractJson("/teacher/calendar", "get", 200, body);
    }),
    http.get(`${BASE}/teacher/classes`, () =>
      contractJson("/teacher/classes", "get", 200, {
        items: [deckClass("evening"), deckClass("foundation")],
        page: 1,
        pageSize: 100,
        total: 2,
        facets: { all: 2, joinable: 2, archived: 0, students: 36 },
      }),
    ),
  );
}

const EMPTY: Calendar = { sessions: [], assignmentEvents: [], terms: [] };

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderPage(path = "/teacher/calendar") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/teacher/calendar",
        element: (
          <>
            <CalendarPage />
            <Where />
          </>
        ),
      },
      { path: "/teacher/assignments/:id", element: <Where /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { client, router };
}

const where = () => screen.getByTestId("where").textContent;

/** day waits for the week to arrive and returns one of its day columns. */
async function day(name: string) {
  await waitFor(() => expect(document.querySelector("[aria-busy]")).toBeNull());
  return screen.getByRole("group", { name });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  useAuthStore.setState({ user: teacherUser });
  reads = [];
});

afterEach(async () => {
  useAuthStore.setState({ user: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await act(() => i18n.changeLanguage("vi"));
});

describe("Calendar: the header and the week in the address", () => {
  it("heads this week when the address names none, and reads it from Monday to the next Monday", async () => {
    serveWeeks((from) => deckWeek(from));
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "22 – 28 tháng 9" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(reads[0]!.get("from")).toBe("2025-09-22");
    expect(reads[0]!.get("to")).toBe("2025-09-29");
  });

  it("round-trips ?week=: next and previous name the week, Today drops it", async () => {
    serveWeeks((from) => deckWeek(from));
    renderPage("/teacher/calendar?week=2026-W39");
    const user = userEvent.setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "21 – 27 tháng 9",
    );
    await user.click(screen.getByRole("button", { name: "Tuần sau" }));
    expect(where()).toBe("/teacher/calendar?week=2026-W40");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "28 tháng 9 – 4 tháng 10",
    );
    await user.click(screen.getByRole("button", { name: "Tuần trước" }));
    await user.click(screen.getByRole("button", { name: "Tuần trước" }));
    expect(where()).toBe("/teacher/calendar?week=2026-W38");
    await user.click(screen.getByRole("button", { name: "Hôm nay" }));
    expect(where()).toBe("/teacher/calendar");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "22 – 28 tháng 9",
    );
    await waitFor(() =>
      expect(reads.map((query) => query.get("from"))).toEqual([
        "2026-09-21",
        "2026-09-28",
        "2026-09-21",
        "2026-09-14",
        "2025-09-22",
      ]),
    );
  });

  it("reads an address it cannot name a week from as this week", () => {
    serveWeeks((from) => deckWeek(from));
    renderPage("/teacher/calendar?week=2027-W53");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "22 – 28 tháng 9",
    );
  });

  it("offers + Buổi học only to a teacher who may change classes", async () => {
    serveWeeks((from) => deckWeek(from));
    useAuthStore.setState({ user: assistantUser });
    renderPage();
    await day("Th 4, 24 thg 9");
    expect(screen.queryByRole("button", { name: "Buổi học" })).toBeNull();
  });

  it("speaks English: the week, the buttons and the legend", async () => {
    await act(() => i18n.changeLanguage("en"));
    serveWeeks((from) => deckWeek(from));
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "22 – 28 September",
    );
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Session" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Legend" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Class session", "Test closes", "Test opens"]);
    const wednesday = await day("Wed 24 Sep");
    expect(
      within(wednesday).getByRole("link", { name: /Reading Mock opens/ }),
    ).toHaveTextContent("08:00");
  });
});

describe("Calendar: the week grid", () => {
  it("draws the deck's week: 08:00 to 22:00, today's column with the now-line", async () => {
    serveWeeks((from) => deckWeek(from));
    renderPage();
    const wednesday = await day("Th 4, 24 thg 9");
    expect(wednesday).toHaveAttribute("aria-current", "date");
    expect(wednesday.style.height).toBe(`${14 * 44}px`);
    const evening = within(wednesday).getByRole("button", {
      name: "IELTS 6.5 Evening 18:00 – 19:30",
    });
    expect(evening.style.top).toBe(`${10 * 44 + 1}px`);
    expect(evening.style.height).toBe(`${1.5 * 44 - 3}px`);
    const line = wednesday.querySelector<HTMLElement>("[data-slot='now-line']")!;
    expect(line.style.top).toBe(`${12.25 * 44}px`);
    expect(line).toHaveClass("motion-safe:transition-[top]");
    expect(screen.getByRole("group", { name: "Th 7, 27 thg 9" })).toHaveClass(
      "bg-sidebar",
    );
    expect(screen.getByRole("group", { name: "Th 2, 22 thg 9" })).not.toHaveClass(
      "bg-sidebar",
    );
  });

  it("grows to 07:00 for a 07:00 session, and places the session on the first row", async () => {
    serveWeeks((from) => deckWeek(from, { grown: true }));
    renderPage();
    const monday = await day("Th 2, 22 thg 9");
    expect(monday.style.height).toBe(`${15 * 44}px`);
    const early = within(monday).getByRole("button", {
      name: /Kids Starters B 07:00 – 08:30/,
    });
    expect(early.style.top).toBe("1px");
    const evening = within(monday).getByRole("button", { name: /IELTS 6.5 Evening/ });
    expect(evening.style.top).toBe(`${11 * 44 + 1}px`);
  });

  it("opens on 08:00 when a test before it grows the grid, and on an earlier first session", async () => {
    const early = (from: string, hours: number) => ({
      kind: "closes" as const,
      at: new Date(Date.parse(`${from}T00:00:00+07:00`) + (2 * 24 + hours) * 3_600_000)
        .toISOString()
        .replace(".000Z", "Z"),
      assignmentId: DECK_ASSIGNMENTS.reading,
      title: "Reading Mock",
      classNames: ["IELTS 6.5 Evening"],
    });
    serveWeeks((from) => {
      const week = deckWeek(from);
      return {
        ...week,
        assignmentEvents: [...week.assignmentEvents, early(from, 2.75)],
      };
    });
    const { router } = renderPage();
    const wednesday = await day("Th 4, 24 thg 9");
    expect(wednesday.style.height).toBe(`${20 * 44}px`);
    const scroller = document.querySelector<HTMLElement>(
      "[data-slot='week-scroller']",
    )!;
    expect(scroller.scrollTop).toBe(6 * 44);

    serveWeeks((from) => {
      const week = deckWeek(from, { grown: true });
      return { ...week, assignmentEvents: [...week.assignmentEvents, early(from, 5)] };
    });
    await act(() => router.navigate("/teacher/calendar?week=2025-W40"));
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Th 2, 29 thg 9" }).style.height).toBe(
        `${17 * 44}px`,
      ),
    );
    expect(scroller.scrollTop).toBe(2 * 44);
  });

  it("opens the assignment from a test's opening or closing", async () => {
    serveWeeks((from) => deckWeek(from));
    renderPage();
    const thursday = await day("Th 5, 25 thg 9");
    await userEvent
      .setup()
      .click(within(thursday).getByRole("link", { name: /Listening đóng/ }));
    expect(where()).toBe(`/teacher/assignments/${DECK_ASSIGNMENTS.listening}`);
  });

  it("keeps a cancelled session on the grid, struck through, reading Đã huỷ", async () => {
    serveWeeks((from) => ({
      ...deckWeek(from),
      sessions: [deckSession(from, 3, 17.5, 1.5, "foundation", { cancelled: true })],
    }));
    renderPage();
    const thursday = await day("Th 5, 25 thg 9");
    const off = within(thursday).getByRole("button", {
      name: "IELTS Foundation A Đã huỷ",
    });
    expect(off).toHaveClass("bg-muted");
    expect(within(off).getByText("IELTS Foundation A")).toHaveClass("line-through");
  });
});

describe("Calendar: its states", () => {
  it("draws the header at once and blocks where sessions will be while the week loads", async () => {
    let release = () => {};
    server.use(
      http.get(`${BASE}/teacher/calendar`, async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return contractJson("/teacher/calendar", "get", 200, EMPTY);
      }),
    );
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "22 – 28 tháng 9",
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Đang tải…");
    expect(document.querySelectorAll("[data-slot='skeleton']")).toHaveLength(7);
    release();
    await screen.findByText("Tuần này chưa có buổi học nào.");
  });

  it("keeps the grid of an empty week, with the sentence and + Buổi học over it", async () => {
    serveWeeks(() => EMPTY);
    renderPage();
    await screen.findByText("Tuần này chưa có buổi học nào.");
    expect(screen.getAllByRole("group", { name: /thg 9/ })).toHaveLength(7);
    expect(screen.getAllByRole("button", { name: "Buổi học" })).toHaveLength(2);
  });

  it("says a week that cannot load cannot, and reads it again on Thử lại", async () => {
    let fail = true;
    serveWeeks((from) => (fail ? "fail" : deckWeek(from)));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không tải được lịch.");
    expect(screen.queryByRole("group", { name: /thg 9/ })).toBeNull();
    fail = false;
    await userEvent
      .setup()
      .click(within(alert).getByRole("button", { name: "Thử lại" }));
    await day("Th 4, 24 thg 9");
  });

  it("polls nothing, and reads the week again when the window regains focus", async () => {
    serveWeeks((from) => deckWeek(from));
    renderPage();
    await day("Th 4, 24 thg 9");
    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60_000));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(reads).toHaveLength(2));
  });
});

describe("Calendar: the agenda on a phone", () => {
  it("lists the days from today, each row with its bar, start, title and time", async () => {
    viewport("phone");
    contentWidth(360);
    serveWeeks((from) => deckWeek(from));
    renderPage();
    const today = await screen.findByRole("heading", {
      level: 2,
      name: "Hôm nay · Th 4, 24 thg 9",
    });
    expect(today).toHaveClass("text-brand-ink");
    expect(screen.queryByRole("group", { name: /thg 9/ })).toBeNull();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Hôm nay · Th 4, 24 thg 9",
      "Th 5, 25 thg 9",
      "Th 6, 26 thg 9",
      "Th 7, 27 thg 9",
      "CN, 28 thg 9",
    ]);
    const rows = within(today.nextElementSibling as HTMLElement).getAllByRole(
      "listitem",
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      "08:00 Reading Mock mở Khung làm bài",
      "18:00 IELTS 6.5 Evening 18:00 – 19:30",
      "21:00 Reading Mock đóng Khung làm bài",
    ]);
    expect(rows[0]!.querySelector("[aria-hidden='true']")).toHaveClass("bg-info");
    expect(rows[1]!.querySelector("[aria-hidden='true']")).toHaveClass("bg-brand");
    expect(rows[2]!.querySelector("[aria-hidden='true']")).toHaveClass("bg-warning");
  });

  it("keeps the grid at 1024 with the sidebar open, and lists the agenda at 768 with it open", async () => {
    const window = viewport(1024);
    const content = contentWidth(720);
    serveWeeks((from) => deckWeek(from));
    renderPage();
    await day("Th 4, 24 thg 9");
    window.resize(768);
    content.resize(464);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Hôm nay · Th 4, 24 thg 9",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /thg 9/ })).toBeNull();
  });

  it("gives an empty week one sentence and + Buổi học on a phone", async () => {
    viewport("phone");
    contentWidth(360);
    serveWeeks(() => EMPTY);
    renderPage();
    await screen.findByText("Tuần này chưa có buổi học nào.");
    expect(screen.queryByRole("group", { name: /thg 9/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Buổi học" })).toHaveLength(2);
  });
});

describe("Calendar: adding a session", () => {
  it("posts the form, toasts Đã thêm buổi học and moves to the new session's week", async () => {
    serveWeeks((from) => deckWeek(from));
    let posted: { id: string; body: unknown } | null = null;
    server.use(
      http.post(`${BASE}/teacher/classes/:id/sessions`, async ({ request, params }) => {
        posted = { id: String(params["id"]), body: await request.json() };
        return contractJson(
          "/teacher/classes/{id}/sessions",
          "post",
          201,
          deckSession("2025-10-06", 2, 18, 1.5, "evening"),
        );
      }),
    );
    renderPage();
    const user = userEvent.setup();
    await day("Th 4, 24 thg 9");
    await user.click(screen.getByRole("button", { name: "Buổi học" }));
    const dialog = await screen.findByRole("dialog", { name: "Buổi học mới" });
    await user.click(within(dialog).getByRole("button", { name: "Thêm buổi học" }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toEqual({
      id: deckClass("evening").id,
      body: {
        date: "2025-09-24",
        startTime: "18:00",
        durationMinutes: 90,
        room: "Phòng 2",
        repeatWeekly: true,
      },
    });
    expect(
      await screen.findByText("Đã thêm buổi học · IELTS 6.5 Evening, 18:00"),
    ).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe("/teacher/calendar?week=2025-W41"));
    await waitFor(() => expect(reads.length).toBeGreaterThanOrEqual(2));
  });
});
