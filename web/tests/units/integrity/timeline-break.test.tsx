import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { Timeline } from "@/features/integrity/components/Timeline";
import type { IntegrityEvent } from "@/features/attempts/api";
import i18n from "@/lib/i18n";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { ATTEMPT_ID, BASE, review } from "../attempts/fixtures";

const SESSION = "018f0000-0000-7000-8000-00000000ab01";
const startedAt = "2026-09-22T12:02:10Z";
const submittedAt = "2026-09-24T13:14:22Z";

/** The F1 page's attempt: a break of a day, a closed page, three days. */
function events(): IntegrityEvent[] {
  const at = (id: number, kind: string, occurredAt: string, durationMs?: number) => ({
    id,
    kind,
    occurredAt,
    offsetMs: new Date(occurredAt).getTime() - new Date(startedAt).getTime(),
    clientSeq: id,
    sessionId: SESSION,
    ...(durationMs === undefined ? {} : { durationMs }),
  });
  return [
    at(1, "tab_hidden", "2026-09-22T12:09:44Z", 34_000),
    at(2, "tab_visible", "2026-09-22T12:10:18Z"),
    at(3, "paper_left", "2026-09-22T12:15:02Z"),
    at(4, "resume", "2026-09-23T13:31:40Z"),
    at(5, "page_hide", "2026-09-23T13:44:30Z"),
    at(6, "resume", "2026-09-24T12:58:03Z"),
  ];
}

function mount(presentation: "compact" | "full", list = events(), done = submittedAt) {
  server.use(
    http.get(`${BASE}/teacher/attempts/${ATTEMPT_ID}/events`, () =>
      contractJson("/teacher/attempts/{id}/events", "get", 200, {
        startedAt,
        summary: { ...review().integrity, awayEpisodes: 1, totalAwayMs: 34_000 },
        events: list,
      }),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Timeline
        attemptId={ATTEMPT_ID}
        questions={[]}
        live={false}
        note={null}
        submittedAt={done}
        presentation={presentation}
        onViewPaper={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("the timeline of an attempt over days (F1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-25T03:00:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    void i18n.changeLanguage("vi");
  });

  it("dates each day's first event in the sheet and draws the break, its resume and the closed page neutral", async () => {
    mount("compact");
    const region = await screen.findByRole("region", { name: "Diễn biến bài làm" });
    const items = within(region).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Bắt đầu làm bàiThứ 3, 22/09 · 19:02:10",
      "Chuyển sang tab khác · 34 giây19:09:44",
      "Tạm nghỉ · 1 ngày 1 giờ19:15:02",
      "Vào lại bàiThứ 4, 23/09 · 20:31:40",
      "Đóng trang20:44:30",
      "Vào lại bàiThứ 5, 24/09 · 19:58:03",
      "Nộp bài20:14:22",
    ]);
    const dot = (item: HTMLElement) => item.querySelector("[aria-hidden='true']");
    expect(dot(items[1]!)).toHaveClass("bg-danger");
    for (const index of [2, 3, 4, 5]) {
      expect(dot(items[index]!)).toHaveClass("bg-muted-fg");
      expect(items[index]!.outerHTML).not.toMatch(/danger/);
    }
  });

  it("dates nothing for an attempt that keeps to one day, as today", async () => {
    mount("compact", events().slice(0, 2), "2026-09-22T12:40:00Z");
    const region = await screen.findByRole("region", { name: "Diễn biến bài làm" });
    expect(
      within(region)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Bắt đầu làm bài19:02:10",
      "Chuyển sang tab khác · 34 giây19:09:44",
      "Nộp bài19:40:00",
    ]);
  });

  it("puts days in front of “Từ đầu” past 24 hours on the review page, with the break's length", async () => {
    mount("full");
    const table = await screen.findByRole("table");
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ["Thứ 3, 22/09 · 19:02:10", "0:00", "Bắt đầu làm bài", "—", "1"],
      ["19:09:44", "7:34", "Chuyển sang tab khác", "0:34", "—"],
      ["19:15:02", "12:52", "Tạm nghỉ", "1 ngày 01:16:38", "—"],
      ["Thứ 4, 23/09 · 20:31:40", "1 ngày 01:29:30", "Vào lại bài", "—", "—"],
      ["20:44:30", "1 ngày 01:42:20", "Đóng trang", "—", "—"],
      ["Thứ 5, 24/09 · 19:58:03", "2 ngày 00:55:53", "Vào lại bài", "—", "—"],
    ]);
  });

  it("reads the days and the break in English", async () => {
    await i18n.changeLanguage("en");
    mount("full");
    const table = await screen.findByRole("table");
    const row = within(table).getAllByRole("row")[4]!;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Wed 23 Sep · 20:31:40",
      "1 day 01:29:30",
      "Resumed the test",
      "—",
      "—",
    ]);
    expect(within(table).getByText("Took a break")).toBeInTheDocument();
  });
});
