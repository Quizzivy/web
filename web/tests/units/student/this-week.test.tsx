import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { matchRoutes } from "react-router";
import ThisWeekPage from "@/features/calendar/pages/student/ThisWeekPage";
import StudentLayout from "@/layouts/StudentLayout";
import { routesFor } from "@/app/router";
import { setLocale } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { viewport } from "@tests/support/viewport";
import { BASE, STUDENT, renderAt } from "./support";

const flags = vi.hoisted(() => ({
  notifications: false,
  messages: false,
  schedule: true,
  grades: false,
  learn: false,
}));
vi.mock("@/app/modules", () => ({ modules: flags }));

/** The deck's now: Wednesday 24 September 2025, 20:15 in Ho Chi Minh City. */
const NOW = new Date("2025-09-24T13:15:00Z");

const EVENING = "018f0000-0000-7000-8000-0000000000c1";
const FOUNDATION = "018f0000-0000-7000-8000-0000000000c2";
const READING = "018f0000-0000-7000-8000-0000000000d1";
const LISTENING = "018f0000-0000-7000-8000-0000000000d2";
const VOCABULARY = "018f0000-0000-7000-8000-0000000000d3";

function session(
  classId: string,
  startsAt: string,
  over: Record<string, unknown> = {},
) {
  return {
    kind: "session",
    classId,
    className: classId === EVENING ? "IELTS 6.5 Evening" : "IELTS Foundation A",
    startsAt,
    durationMinutes: 90,
    room: classId === EVENING ? "Phòng 2" : "Phòng 1",
    note: null,
    cancelled: false,
    ...over,
  };
}

function due(
  assignmentId: string,
  title: string,
  closesAt: string,
  over: Record<string, unknown> = {},
) {
  return {
    kind: "due",
    assignmentId,
    title,
    closesAt,
    state: "not_started",
    durationMinutes: 30,
    ...over,
  };
}

/** The deck's week for the student Bảo, 22 to 28 September, times in UTC+7. */
function deckWeek(over: { cancelThursday?: boolean } = {}) {
  return {
    start: "2025-09-22",
    end: "2025-09-28",
    days: [
      { date: "2025-09-22", items: [session(EVENING, "2025-09-22T11:00:00Z")] },
      { date: "2025-09-23", items: [session(FOUNDATION, "2025-09-23T10:30:00Z")] },
      {
        date: "2025-09-24",
        items: [
          session(EVENING, "2025-09-24T11:00:00Z"),
          due(
            READING,
            "Reading · Why cities need green space",
            "2025-09-24T14:00:00Z",
            {
              state: "in_progress",
              durationMinutes: 60,
            },
          ),
        ],
      },
      {
        date: "2025-09-25",
        items: [
          due(LISTENING, "Unit 4 · Listening: Directions", "2025-09-25T01:00:00Z"),
          session(FOUNDATION, "2025-09-25T10:30:00Z", {
            cancelled: over.cancelThursday ?? false,
          }),
        ],
      },
      {
        date: "2025-09-26",
        items: [
          session(EVENING, "2025-09-26T11:00:00Z", { note: "Phòng 3 tuần này" }),
          due(VOCABULARY, "Vocabulary check · Environment", "2025-09-26T15:00:00Z", {
            durationMinutes: null,
          }),
        ],
      },
      { date: "2025-09-27", items: [] },
      { date: "2025-09-28", items: [] },
    ],
  };
}

function emptyWeek(start = "2025-09-22") {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: `2025-09-${String(22 + i).padStart(2, "0")}`,
    items: [],
  }));
  return { start, end: "2025-09-28", days };
}

let reads: (string | null)[] = [];

function serveWeek(answer: () => unknown) {
  server.use(
    http.get(`${BASE}/app/week`, async ({ request }) => {
      reads.push(new URL(request.url).searchParams.get("start"));
      const body = answer();
      if (body === "wait") await delay("infinite");
      if (body === "fail")
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "boom", requestId: "req-1" } },
          { status: 500 },
        );
      return contractJson("/app/week", "get", 200, body);
    }),
  );
}

function show(path = "/week", user: Parameters<typeof renderAt>[3] = STUDENT) {
  return renderAt(
    path,
    [
      {
        path: "/week",
        element: (
          <main>
            <ThisWeekPage />
          </main>
        ),
      },
      { path: "/assignments/:id", element: <p>intro</p> },
      { path: "/classes", element: <p>classes</p> },
    ],
    undefined,
    user,
  );
}

/** The StudentLayout's account sync applies the user's own language. */
const ENGLISH = { ...STUDENT, locale: "en" as const };

/** day is the row of one date, found by the heading a screen reader hears. */
function day(name: string) {
  const heading = screen.getByRole("heading", { level: 2, name });
  return heading.closest("section")!;
}

beforeEach(() => {
  reads = [];
  viewport("desktop");
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(async () => {
  vi.useRealTimers();
  useAuthStore.getState().clearSession();
  await setLocale("vi");
});

describe("the week", () => {
  it("is headed as the deck heads it, with the way back to Classes and no way to another week", async () => {
    serveWeek(() => deckWeek());
    show();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tuần này");
    expect(
      screen.getByText("Lớp học và hạn nộp bài, 22 – 28 tháng 9."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lớp" })).toHaveAttribute(
      "href",
      "/classes",
    );
    await screen.findByRole("heading", { level: 2, name: "Th 2, 22 thg 9" });
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(7);
    expect(screen.queryByRole("button")).toBeNull();
    expect(reads).toEqual([null]);
  });

  it("fills today's date and only today's", async () => {
    serveWeek(() => deckWeek());
    show();
    await screen.findByRole("heading", { level: 2, name: "Th 4, 24 thg 9" });

    const filled = [...document.querySelectorAll("[data-slot=day-number]")].filter(
      (number) => number.classList.contains("bg-primary"),
    );
    expect(filled.map((number) => number.textContent)).toEqual(["24"]);
    expect(
      screen.getByRole("heading", { level: 2, name: "Th 4, 24 thg 9" }),
    ).toHaveAttribute("aria-current", "date");
    expect(
      screen.getByRole("heading", { level: 2, name: "Th 3, 23 thg 9" }),
    ).not.toHaveAttribute("aria-current");
    expect(within(day("Th 4, 24 thg 9")).getByText("Th 4")).toHaveClass("uppercase");
  });

  it("gives a session its room and length and its start, and opens Classes", async () => {
    serveWeek(() => deckWeek());
    show();
    const monday = await screen.findByRole("heading", {
      level: 2,
      name: "Th 2, 22 thg 9",
    });

    const row = within(monday.closest("section")!).getByRole("link");
    expect(row).toHaveAttribute("href", "/classes");
    expect(row).toHaveTextContent("IELTS 6.5 Evening");
    expect(row).toHaveTextContent("Phòng 2 · 90 phút");
    expect(row).toHaveTextContent("18:00");
    expect(row).toHaveClass("bg-card");
  });

  it("puts the date's note in place of the room and length", async () => {
    serveWeek(() => deckWeek());
    show();
    await screen.findByRole("heading", { level: 2, name: "Th 6, 26 thg 9" });

    const friday = within(day("Th 6, 26 thg 9"));
    const evening = friday.getByText("IELTS 6.5 Evening").closest("a")!;
    expect(evening).toHaveTextContent("Phòng 3 tuần này");
    expect(evening).not.toHaveTextContent("Phòng 2");
    expect(evening).not.toHaveTextContent("90 phút");
  });

  it("keeps a cancelled session in its day, muted and struck through, opening nothing", async () => {
    serveWeek(() => deckWeek({ cancelThursday: true }));
    show();
    await screen.findByRole("heading", { level: 2, name: "Th 5, 25 thg 9" });

    const thursday = within(day("Th 5, 25 thg 9"));
    const title = thursday.getByText("IELTS Foundation A");
    const row = title.closest("li")!;
    expect(row).toHaveTextContent("Đã huỷ");
    expect(row).not.toHaveTextContent("Phòng 1");
    expect(row).toHaveTextContent("17:30");
    expect(row).toHaveClass("bg-muted");
    expect(title).toHaveClass("line-through", "text-muted-fg");
    expect(title.closest("a")).toBeNull();
    expect(thursday.getAllByRole("link")).toHaveLength(1);
  });

  it("tints a test, says how it stands and opens its intro", async () => {
    const user = userEvent.setup();
    serveWeek(() => deckWeek());
    const router = show();
    await screen.findByRole("heading", { level: 2, name: "Th 4, 24 thg 9" });

    const reading = screen.getByRole("link", {
      name: /Reading · Why cities need green space/,
    });
    expect(reading).toHaveAttribute("href", `/assignments/${READING}`);
    expect(reading).toHaveTextContent("Đóng hôm nay · đang làm");
    expect(reading).toHaveTextContent("21:00");
    expect(reading).toHaveClass("bg-warning-soft");
    expect(screen.getByRole("link", { name: /Unit 4 · Listening/ })).toHaveTextContent(
      "Hạn nộp · bài 30 phút",
    );
    expect(screen.getByRole("link", { name: /Unit 4 · Listening/ })).toHaveTextContent(
      "08:00",
    );
    // A test with no timer says only when it is due.
    expect(
      within(screen.getByRole("link", { name: /Vocabulary check/ })).getByText(
        "Hạn nộp",
      ),
    ).toBeInTheDocument();

    await user.click(reading);
    expect(router.state.location.pathname).toBe(`/assignments/${READING}`);
    expect(screen.getByText("intro")).toBeInTheDocument();
  });

  it("says a day has nothing on it", async () => {
    serveWeek(() => deckWeek());
    show();
    await screen.findByRole("heading", { level: 2, name: "Th 7, 27 thg 9" });

    expect(
      within(day("Th 7, 27 thg 9")).getByText("Không có lịch"),
    ).toBeInTheDocument();
    expect(within(day("CN, 28 thg 9")).getByText("Không có lịch")).toBeInTheDocument();
    expect(within(day("Th 2, 22 thg 9")).queryByText("Không có lịch")).toBeNull();
  });

  it("honours a link's ?start= and heads the week the server answers", async () => {
    serveWeek(() => ({
      ...emptyWeek("2025-09-29"),
      end: "2025-10-05",
      days: Array.from({ length: 7 }, (_, i) => ({
        date: i < 2 ? `2025-09-${29 + i}` : `2025-10-0${i - 1}`,
        items: i === 0 ? [session(EVENING, "2025-09-29T11:00:00Z")] : [],
      })),
    }));
    show("/week?start=2025-10-01");

    expect(
      screen.getByText("Lớp học và hạn nộp bài, 29 tháng 9 – 5 tháng 10."),
    ).toBeInTheDocument();
    await screen.findByRole("heading", { level: 2, name: "Th 2, 29 thg 9" });
    expect(reads).toEqual(["2025-10-01"]);
    expect(document.querySelector(".bg-primary[data-slot=day-number]")).toBeNull();
  });

  it("reads this week when ?start= is not a date", async () => {
    serveWeek(() => deckWeek());
    show("/week?start=2025-02-30");
    await screen.findByRole("heading", { level: 2, name: "Th 2, 22 thg 9" });
    expect(reads).toEqual([null]);
  });
});

describe("the states", () => {
  it("draws rows of the week's shape while it loads, under the heading", async () => {
    serveWeek(() => "wait");
    show();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tuần này");
    expect(
      screen.getByText("Lớp học và hạn nộp bài, 22 – 28 tháng 9."),
    ).toBeInTheDocument();
    const status = await screen.findByRole("status", { name: "Đang tải…" });
    expect(status.querySelectorAll("[data-slot=skeleton].rounded-full")).toHaveLength(
      4,
    );
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("says a week with nothing in it once, in place of seven rows", async () => {
    serveWeek(() => emptyWeek());
    show();

    expect(await screen.findByText("Tuần này không có lịch.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByText("Không có lịch")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says the week could not load, keeps the heading, and reads it again on retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    serveWeek(() => (fail ? "fail" : deckWeek()));
    show();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không tải được lịch tuần này.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tuần này");
    expect(screen.getByRole("link", { name: "Lớp" })).toBeInTheDocument();

    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("heading", { level: 2, name: "Th 2, 22 thg 9" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("on a phone", () => {
  it("is a detail screen: the bar says This week and goes back to Classes, and the tabs go", async () => {
    viewport("phone");
    serveWeek(() => deckWeek());
    const match = matchRoutes(routesFor("student"), "/week")!.at(-1)!;
    expect(match.route.path).toBe("week");
    renderAt("/week", [
      {
        element: <StudentLayout />,
        children: [
          { path: "/week", element: <ThisWeekPage />, handle: match.route.handle },
        ],
      },
    ]);

    const back = await screen.findByRole("link", { name: "Quay lại" });
    expect(back).toHaveAttribute("href", "/classes");
    expect(
      within(screen.getAllByRole("banner")[0]!).getByText("Tuần này"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).toBeNull();
    // The page's own way back is the desktop's; the bar carries it here.
    expect(screen.queryByRole("link", { name: "Lớp" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tuần này");
    await screen.findByRole("heading", { level: 2, name: "Th 4, 24 thg 9" });
  });
});

describe("in English", () => {
  it("writes the deck's words", async () => {
    await setLocale("en");
    serveWeek(() => deckWeek({ cancelThursday: true }));
    show("/week", ENGLISH);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This week");
    expect(
      screen.getByText("Classes and test deadlines, 22 – 28 September."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Classes" })).toBeInTheDocument();
    await screen.findByRole("heading", { level: 2, name: "Wed 24 Sep" });
    expect(screen.getByRole("link", { name: /Reading/ })).toHaveTextContent(
      "Closes today · in progress",
    );
    expect(screen.getByRole("link", { name: /Unit 4/ })).toHaveTextContent(
      "Due · 30 min test",
    );
    expect(within(day("Mon 22 Sep")).getByRole("link")).toHaveTextContent(
      "Phòng 2 · 90 min",
    );
    expect(within(day("Thu 25 Sep")).getByText("Cancelled")).toBeInTheDocument();
    expect(
      within(day("Sat 27 Sep")).getByText("Nothing scheduled"),
    ).toBeInTheDocument();
  });

  it("says an empty week in a sentence", async () => {
    await setLocale("en");
    serveWeek(() => emptyWeek());
    show("/week", ENGLISH);
    expect(await screen.findByText("Nothing scheduled this week.")).toBeInTheDocument();
  });
});
