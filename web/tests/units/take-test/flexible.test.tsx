import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import TakeTestPage from "@/features/take-test/pages/TakeTestPage";
import {
  getAttempt,
  saveAnswers,
  submitAttempt,
  type AttemptSession,
  type IntegrityPolicy,
  type StudentQuestion,
} from "@/features/take-test/api";
import { FLUSH_DEBOUNCE_MS, useTakeTestStore } from "@/features/take-test/store";
import { session, text, viewport } from "./support";
import i18n from "@/lib/i18n";

vi.mock("@/features/take-test/api", () => ({
  getAttempt: vi.fn(),
  saveAnswers: vi.fn(),
  submitAttempt: vi.fn(),
  recordAudioPlay: vi.fn(),
}));

/** 12:00 in the app's zone, on Tuesday 22/09. */
const NOW = new Date("2026-09-22T05:00:00.000Z");
/** 22:00 on Saturday 26/09, the deck's close. */
const CLOSE = "2026-09-26T15:00:00.000Z";
const MINUTE = 60_000;
const TITLE = "Reading · Why cities need green space";

const questions: StudentQuestion[] = [
  {
    id: "q1",
    sectionId: "s1",
    type: "short_answer",
    prompt: "What should cities prioritise?",
    points: 1,
  },
];

const store = () => useTakeTestStore.getState();
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const banner = () => within(screen.getByRole("banner"));

let sent: { url: string; body: Blob }[] = [];

function reply() {
  const now = new Date().toISOString();
  return {
    serverTime: now,
    savedAt: now,
    deadlineAt: new Date(store().deadlineAt).toISOString(),
  };
}

async function open(
  over: {
    deadlineAt?: string;
    mode?: AttemptSession["mode"];
    integrity?: Partial<IntegrityPolicy>;
    focusLossCount?: number;
  } = {},
) {
  const base = session({
    serverTime: NOW.toISOString(),
    deadlineAt: over.deadlineAt ?? CLOSE,
  });
  vi.mocked(getAttempt).mockResolvedValue({
    ...base,
    mode: over.mode ?? "flexible",
    attempt: {
      ...base.attempt,
      ...(over.focusLossCount === undefined
        ? {}
        : {
            integrity: {
              focusLossCount: over.focusLossCount,
              flagged: over.focusLossCount > 0,
            },
          }),
    },
    integrity: { ...base.integrity, ...over.integrity },
    testTitle: TITLE,
    questions,
  } as AttemptSession);
  const router = createMemoryRouter(
    [
      { path: "/attempts/:attemptId", element: <TakeTestPage /> },
      { path: "/", element: <p>home</p> },
    ],
    { initialEntries: ["/attempts/att-1"] },
  );
  render(<RouterProvider router={router} />);
  await pass(0);
  return router;
}

async function leaveFor(ms: number) {
  act(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await pass(ms);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await pass(0);
}

function beacons(): Promise<
  { events: { kind: string; questionId?: string }[]; activeMs?: number }[]
> {
  return Promise.all(sent.map(async ({ body }) => JSON.parse(await body.text())));
}

beforeEach(() => {
  viewport("desktop");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  localStorage.clear();
  sessionStorage.clear();
  store().reset();
  sent = [];
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: vi.fn((url: string, body: Blob) => {
      sent.push({ url, body });
      return true;
    }),
  });
  vi.mocked(saveAnswers)
    .mockReset()
    .mockImplementation(async () => reply());
  vi.mocked(submitAttempt)
    .mockReset()
    .mockImplementation(async () => ({
      ...session({ serverTime: NOW.toISOString(), deadlineAt: CLOSE }).attempt,
      status: "submitted",
      submittedAt: new Date().toISOString(),
    }));
});

afterEach(async () => {
  store().reset();
  await act(() => i18n.changeLanguage("vi"));
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the header under flexible", () => {
  it("shows when the test closes, with no timer, while the close is more than an hour away", async () => {
    await open();
    const pill = banner().getByRole("img", {
      name: "Bài đóng lúc 22:00, Thứ 7, 26/09",
    });
    expect(pill).toHaveTextContent("Đóng 22:00, 26/09");
    expect(pill).toHaveClass("bg-muted", "text-fg");
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("says today for a close on the same day", async () => {
    await open({ deadlineAt: "2026-09-22T15:00:00.000Z" });
    expect(banner().getByRole("img", { name: "Bài đóng lúc 22:00" })).toHaveTextContent(
      "Đóng 22:00 hôm nay",
    );
  });

  it("drops the word below 768 and keeps the date", async () => {
    viewport("phone");
    await open();
    const pill = banner().getByRole("img", {
      name: "Bài đóng lúc 22:00, Thứ 7, 26/09",
    });
    expect(pill).toHaveTextContent(/^22:00, 26\/09$/);
  });

  it("names a close on another day with the weekday, in English too", async () => {
    await act(() => i18n.changeLanguage("en"));
    await open();
    expect(
      banner().getByRole("img", { name: "The test closes Sat 26 Sep, 22:00" }),
    ).toHaveTextContent("Closes 22:00, 26 Sep");
  });

  it("says it in English too", async () => {
    await act(() => i18n.changeLanguage("en"));
    await open({ deadlineAt: "2026-09-22T15:00:00.000Z" });
    expect(
      banner().getByRole("img", { name: "The test closes 22:00" }),
    ).toHaveTextContent("Closes today 22:00");
  });

  it("counts down in the last hour, as today", async () => {
    await open({ deadlineAt: at(60 * MINUTE + 2_000) });
    expect(banner().getByRole("img", { name: /^Bài đóng lúc/ })).toBeInTheDocument();
    await pass(1_000);
    expect(screen.queryByRole("timer")).toBeNull();
    await pass(1_000);
    expect(screen.getByRole("timer", { name: "Thời gian còn lại" })).toHaveTextContent(
      /^(60:00|59:59)$/,
    );
    expect(banner().queryByRole("img", { name: /^Bài đóng lúc/ })).toBeNull();
  });

  it("takes the danger tones under five minutes, as today", async () => {
    await open({ deadlineAt: at(4 * MINUTE) });
    expect(screen.getByRole("timer")).toHaveClass("bg-danger-soft", "text-danger-ink");
  });

  it("submits as timed out at the close, as under strict", async () => {
    await open({ deadlineAt: at(3_000) });
    await pass(3_000);
    await waitFor(() =>
      expect(submitAttempt).toHaveBeenCalledWith("att-1", { reason: "timer_expired" }),
    );
    expect(
      await screen.findByText("Bài đã hết giờ và được nộp tự động."),
    ).toBeInTheDocument();
  });
});

describe("the ✕ under flexible", () => {
  it("is named Tạm nghỉ and asks about a break, with nothing about a clock", async () => {
    await open();
    fireEvent.click(banner().getByRole("button", { name: "Tạm nghỉ" }));
    await pass(0);
    const dialog = screen.getByRole("dialog", { name: "Tạm nghỉ?" });
    expect(dialog).toHaveTextContent(
      "Câu trả lời của bạn đã được lưu. Bạn có thể quay lại làm tiếp, kể cả trên thiết bị khác, trước 22:00, Thứ 7, 26/09.",
    );
    expect(dialog.textContent).not.toMatch(/Đồng hồ|đồng hồ/);
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Ở lại", "Tạm nghỉ"]);
  });

  it("says the latest answer is saved first, before the close", async () => {
    await open({ deadlineAt: "2026-09-22T15:00:00.000Z" });
    vi.mocked(saveAnswers).mockImplementationOnce(() => new Promise(() => {}));
    act(() => store().setAnswer("q1", text("parks")));
    fireEvent.click(banner().getByRole("button", { name: "Tạm nghỉ" }));
    await pass(0);
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Câu trả lời mới nhất của bạn sẽ được lưu trước khi thoát. Bạn có thể quay lại làm tiếp trước 22:00.",
    );
  });

  it("says so when the save before the break failed, and offers to try again", async () => {
    await open();
    vi.mocked(saveAnswers).mockRejectedValue(new Error("offline"));
    act(() => store().setAnswer("q1", text("parks")));
    fireEvent.click(banner().getByRole("button", { name: "Tạm nghỉ" }));
    await pass(0);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Tạm nghỉ" }),
    );
    await pass(0);
    const dialog = screen.getByRole("dialog", { name: "Câu trả lời chưa được lưu" });
    expect(dialog).toHaveTextContent(
      "Kết nối chưa ổn định. Hãy thử lưu lại trước khi thoát.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Thử lưu lại" }),
    ).toBeInTheDocument();
  });

  it("records paper_left on the open question before it goes home, by the beacon", async () => {
    const router = await open();
    fireEvent.click(banner().getByRole("button", { name: "Tạm nghỉ" }));
    await pass(0);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Tạm nghỉ" }),
    );
    await pass(10);
    expect(router.state.location.pathname).toBe("/");
    const [beacon, ...others] = await beacons();
    expect(others).toEqual([]);
    expect(beacon?.events.map((event) => [event.kind, event.questionId])).toEqual([
      ["paper_left", "q1"],
    ]);
  });

  it("records no paper_left under strict", async () => {
    const router = await open({ mode: "strict" });
    fireEvent.click(banner().getByRole("button", { name: "Thoát khỏi bài làm" }));
    await pass(0);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Thoát" }),
    );
    await pass(10);
    expect(router.state.location.pathname).toBe("/");
    const kinds = (await beacons()).flatMap((beacon) =>
      beacon.events.map((event) => event.kind),
    );
    expect(kinds).not.toContain("paper_left");
  });

  it("records nothing when the student stays", async () => {
    await open();
    fireEvent.click(banner().getByRole("button", { name: "Tạm nghỉ" }));
    await pass(0);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Ở lại" }),
    );
    await pass(0);
    expect(useTakeTestStore.getState().attemptId).toBe("att-1");
    expect(sent).toEqual([]);
  });
});

describe("leaving the open paper under flexible", () => {
  const strict = { maxFocusLoss: 1, onLimitExceeded: "auto_submit" as const };
  const LEFT =
    "Lần rời trang này đã được ghi lại, và giáo viên sẽ được báo. Câu trả lời của bạn vẫn an toàn. Nếu cần nghỉ, hãy bấm nút ✕ Tạm nghỉ ở góc trên bên trái: bài được lưu để bạn làm tiếp sau.";

  it("says nothing in the header before an absence is counted", async () => {
    await open({ integrity: strict });
    expect(banner().queryByText("Giáo viên đã được báo")).toBeNull();
    expect(banner().queryByText(/lần rời trang/)).toBeNull();
    expect(banner().queryByText("·")).toBeNull();
  });

  it("says the absence is recorded and the teacher told, every time, and never submits", async () => {
    await open({ integrity: strict });
    for (let time = 1; time <= 3; time += 1) {
      await leaveFor(4_000);
      const dialog = screen.getByRole("alertdialog", {
        name: "Bạn vừa rời trang làm bài",
      });
      expect(dialog).toHaveTextContent(LEFT);
      fireEvent.click(within(dialog).getByRole("button", { name: "Quay lại bài làm" }));
      await pass(0);
    }
    expect(banner().getByText("Giáo viên đã được báo")).toHaveClass(
      "text-warning-ink",
      "font-medium",
    );
    expect(banner().queryByText(/lần rời trang/)).toBeNull();
    await pass(5_000);
    expect(submitAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText("Bài làm đang được nộp")).toBeNull();
    expect(store().submitState).toBe("idle");
  });

  it("does not count an absence shorter than the threshold", async () => {
    await open();
    await leaveFor(1_000);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(banner().queryByText("Giáo viên đã được báo")).toBeNull();
  });

  it("says the teacher has been told on a paper resumed after an earlier absence", async () => {
    await open({ focusLossCount: 2, integrity: strict });
    expect(banner().getByText("Giáo viên đã được báo")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(submitAttempt).not.toHaveBeenCalled();
  });

  it("puts the line in the save strip on a phone", async () => {
    viewport("phone");
    await open({ integrity: strict });
    await leaveFor(4_000);
    expect(document.querySelector('[data-slot="save-strip"]')).toHaveTextContent(
      "Giáo viên đã được báo",
    );
  });
});

describe("time on the paper in the engine", () => {
  it("goes with the saves the engine makes", async () => {
    await open();
    await pass(10_000);
    act(() => store().setAnswer("q1", text("parks")));
    await pass(FLUSH_DEBOUNCE_MS);
    const [, body] = vi.mocked(saveAnswers).mock.calls[0] ?? [];
    expect(body?.activeMs).toBeGreaterThanOrEqual(10_000 + FLUSH_DEBOUNCE_MS);
    expect(body?.activeMs).toBeLessThan(13_000);
  });

  it("goes in the pagehide beacon's body, under strict as well", async () => {
    await open({ mode: "strict" });
    await pass(30_000);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    });
    const [beacon] = await beacons();
    expect(beacon?.activeMs).toBeGreaterThanOrEqual(30_000);
    expect(beacon?.activeMs).toBeLessThan(32_000);
  });

  it("is reported at least once a minute while the paper is open", async () => {
    await open({ mode: "strict" });
    await pass(MINUTE + 100);
    expect(saveAnswers).toHaveBeenCalledTimes(1);
    const [, body] = vi.mocked(saveAnswers).mock.calls[0] ?? [];
    expect(body?.answers).toEqual({});
    expect(body?.activeMs).toBeGreaterThanOrEqual(MINUTE);
  });
});

describe("the submit dialog under flexible", () => {
  async function ask() {
    fireEvent.click(banner().getByRole("button", { name: "Nộp bài" }));
    await pass(0);
    return screen.getByRole("dialog");
  }

  const tiles = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);

  it("names the close in place of the time left", async () => {
    await open();
    const dialog = await ask();
    expect(tiles(dialog)[2]).toEqual(["Bài đóng", "22:00, 26/09"]);
    expect(dialog).toHaveTextContent(
      "Chỗ trống, cặp nối và câu hỏi chưa trả lời sẽ không có điểm. Bài đóng lúc 22:00, 26/09.",
    );
  });

  it("says today for a close on the same day", async () => {
    await open({ deadlineAt: "2026-09-22T15:00:00.000Z" });
    const dialog = await ask();
    expect(tiles(dialog)[2]).toEqual(["Bài đóng", "22:00 hôm nay"]);
    expect(dialog).toHaveTextContent("Bài đóng lúc 22:00.");
  });

  it("keeps the time left under strict", async () => {
    await open({ mode: "strict", deadlineAt: at(38 * MINUTE + 12_000) });
    const dialog = await ask();
    expect(tiles(dialog)[2]?.[0]).toBe("Còn lại");
  });
});
