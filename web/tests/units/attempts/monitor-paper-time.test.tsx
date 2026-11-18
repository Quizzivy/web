import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Monitor } from "@/features/attempts/components/Monitor";
import type { MonitorRow } from "@/features/attempts/api";
import { useAuthStore } from "@/stores/auth";
import i18n from "@/lib/i18n";
import { teacherUser } from "@tests/support/fixtures";
import { contentWidth } from "@tests/support/contentWidth";
import { assignment } from "./fixtures";

const NOW = "2026-09-24T14:00:00Z";
const started = "2026-09-22T12:02:10Z";

function row(n: number, over: Partial<MonitorRow>): MonitorRow {
  return {
    studentId: `018f0000-0000-7000-8000-0000000001e${n}`,
    fullName: `Học viên ${n}`,
    state: "submitted",
    attemptId: `018f0000-0000-7000-8000-0000000001a${n}`,
    attemptNo: 1,
    startedAt: started,
    deadlineAt: "2026-09-26T15:00:00Z",
    submittedAt: null,
    answeredCount: 25,
    score: null,
    focusLossCount: 0,
    flagged: false,
    audioOverLimit: false,
    ...over,
  };
}

const ROWS: MonitorRow[] = [
  // Two days and an hour from start to hand-in, 40 minutes on the paper.
  row(1, { submittedAt: "2026-09-24T13:14:22Z", activeSeconds: 2400 }),
  // A sitting with no break: both come to 52 minutes.
  row(2, { submittedAt: "2026-09-22T12:54:10Z", activeSeconds: 3110 }),
  // Still working: the time on the paper so far.
  row(3, { state: "in_progress", activeSeconds: 540 }),
  // Before F1: the elapsed figure, as today.
  row(4, { submittedAt: "2026-09-22T12:43:10Z", activeSeconds: null }),
  row(5, {
    state: "not_started",
    attemptId: null,
    startedAt: null,
    deadlineAt: null,
    answeredCount: null,
    focusLossCount: null,
  }),
];

function board(width: number, rows = ROWS) {
  contentWidth(width);
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <Monitor
          assignment={assignment({ mode: "flexible" })}
          data={{ serverTime: NOW, questionCount: 25, rows }}
          selectedAttempt={null}
          onOpen={() => {}}
          onRefresh={async () => {}}
        />
      ),
    },
  ]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function timeCell(name: string): HTMLElement {
  const table = screen.getByRole("table");
  const header = within(table).getByRole("columnheader", {
    name: i18n.t("assignmentDetail.timeName"),
  });
  const headers = within(table).getAllByRole("columnheader");
  const column = headers.indexOf(header);
  const line = within(table)
    .getAllByRole("row")
    .find((each) => within(each).queryByText(name) !== null);
  return within(line!).getAllByRole("cell")[column]!;
}

describe("the monitor's time column (F1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    useAuthStore.getState().setSession("token", teacherUser);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAuthStore.getState().clearSession();
    void i18n.changeLanguage("vi");
  });

  it("shows the time on the paper, and the span from start to hand-in under it only when it differs", () => {
    board(1280);
    expect(
      screen.getByRole("columnheader", {
        name: "Thời gian trên bài, và từ lúc bắt đầu đến khi nộp",
      }),
    ).toHaveTextContent(/^Thời gian$/);
    expect(timeCell("Học viên 1")).toHaveTextContent(/^40 phúttrong 2 ngày 1 giờ$/);
    expect(within(timeCell("Học viên 1")).getByText("trong 2 ngày 1 giờ")).toHaveClass(
      "text-xs",
    );
    expect(timeCell("Học viên 2")).toHaveTextContent(/^52 phút$/);
    expect(timeCell("Học viên 3")).toHaveTextContent(/^9 phút$/);
    expect(timeCell("Học viên 4")).toHaveTextContent(/^41 phút$/);
    expect(timeCell("Học viên 5")).toHaveTextContent(/^—$/);
  });

  it("keeps the header's name and the elapsed figure, as today, while no attempt reports time on the paper", () => {
    board(
      1280,
      ROWS.map((each) => ({ ...each, activeSeconds: null })),
    );
    expect(screen.getByRole("columnheader", { name: "Thời gian" })).toBeInTheDocument();
    expect(screen.queryByText(/^trong /)).toBeNull();
  });

  it("reads in English", async () => {
    await i18n.changeLanguage("en");
    board(1280);
    expect(
      screen.getByRole("columnheader", {
        name: "Time on the paper, and from start to hand-in",
      }),
    ).toBeInTheDocument();
    expect(timeCell("Học viên 1")).toHaveTextContent(/^40 minover 2 days 1 hours$/);
  });

  it("hides the column on a phone, as today", () => {
    board(600);
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    expect(
      screen.queryByRole("columnheader", { name: i18n.t("assignmentDetail.timeName") }),
    ).toBeNull();
    expect(screen.queryByText("trong 2 ngày 1 giờ")).toBeNull();
  });
});
