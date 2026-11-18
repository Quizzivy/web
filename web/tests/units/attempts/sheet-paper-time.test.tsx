import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http } from "msw";
import { AttemptSheet } from "@/features/attempts/components/AttemptSheet";
import { SheetNoteController } from "@/features/attempts/components/sheetNotes";
import { useAuthStore } from "@/stores/auth";
import i18n from "@/lib/i18n";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import {
  ASSIGNMENT_ID,
  ATTEMPT_ID,
  BASE,
  assignment,
  defaultRows,
  review,
} from "./fixtures";

const startedAt = "2026-09-22T12:02:10Z";
const submittedAt = "2026-09-24T13:14:22Z";

function serve(activeSeconds: number | undefined) {
  const data = review();
  const paper = {
    ...data,
    attempt:
      activeSeconds === undefined
        ? data.attempt
        : {
            ...data.attempt,
            startedAt,
            deadlineAt: "2026-09-26T15:00:00Z",
            submittedAt,
          },
    ...(activeSeconds === undefined ? {} : { activeSeconds }),
  };
  server.use(
    http.get(`${BASE}/teacher/attempts/${ATTEMPT_ID}`, () =>
      contractJson("/teacher/attempts/{id}", "get", 200, paper),
    ),
    http.get(`${BASE}/teacher/attempts/${ATTEMPT_ID}/events`, () =>
      contractJson("/teacher/attempts/{id}/events", "get", 200, {
        startedAt: paper.attempt.startedAt,
        summary: data.integrity,
        events: [],
      }),
    ),
  );
}

function sheet() {
  const row = {
    ...defaultRows()[1]!,
    attemptId: ATTEMPT_ID,
    state: "submitted" as const,
  };
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <AttemptSheet
          assignment={assignment({ id: ASSIGNMENT_ID, mode: "flexible" })}
          open
          attemptId={ATTEMPT_ID}
          row={row}
          questionCount={2}
          serverTime={new Date().toISOString()}
          receivedAt={Date.now()}
          notes={new SheetNoteController(async () => {})}
          onClose={() => {}}
        />
      ),
    },
  ]);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function timeTile(label: string) {
  const dialog = await screen.findByRole("dialog");
  const term = await within(dialog).findByText(label, { selector: "dt" });
  return term.parentElement!;
}

describe("the attempt sheet's time tile (F1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-25T03:00:00Z"));
    useAuthStore.getState().setSession("token", teacherUser);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAuthStore.getState().clearSession();
    void i18n.changeLanguage("vi");
  });

  it("is the time on the paper, with the span from start to hand-in under it", async () => {
    serve(2400);
    sheet();
    const tile = await timeTile("Thời gian trên bài");
    const values = within(tile).getAllByRole("definition");
    expect(values.map((value) => value.textContent)).toEqual([
      "40 phút",
      "trong 2 ngày 1 giờ",
    ]);
    expect(values[1]).toHaveClass("text-muted-fg", "text-xs");
    expect(screen.queryByText("Thời gian làm")).toBeNull();
  });

  it("reads in English", async () => {
    await i18n.changeLanguage("en");
    serve(2400);
    sheet();
    const tile = await timeTile("Time on the paper");
    expect(
      within(tile)
        .getAllByRole("definition")
        .map((value) => value.textContent),
    ).toEqual(["40 min", "over 2 days 1 hours"]);
  });

  it("is the elapsed time, as today, for an attempt from before F1", async () => {
    serve(undefined);
    sheet();
    const tile = await timeTile("Thời gian làm");
    expect(
      within(tile)
        .getAllByRole("definition")
        .map((value) => value.textContent),
    ).toEqual(["37 phút"]);
    expect(screen.queryByText("Thời gian trên bài")).toBeNull();
  });
});
