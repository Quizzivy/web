import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { saveAnswers, submitAttempt } from "@/features/take-test/api";
import {
  ACTIVE_MS_MAX,
  paperTime,
  reportablePaperTime,
  resetPaperTime,
  settlePaperTime,
  startPaperTime,
  stopPaperTime,
  usePaperTime,
} from "@/features/take-test/activeTime";
import {
  FLUSH_DEBOUNCE_MS,
  REPORT_EVERY_MS,
  useTakeTestStore,
  type LockReason,
  type SubmitState,
} from "@/features/take-test/store";
import { useAppState } from "@/stores/appState";
import { session, text } from "./support";

vi.mock("@/features/take-test/api", () => ({
  saveAnswers: vi.fn(),
  submitAttempt: vi.fn(),
  getAttempt: vi.fn(),
}));

const saved = vi.mocked(saveAnswers);
const submitted = vi.mocked(submitAttempt);
const NOW = new Date("2026-09-01T08:00:00.000Z");
const DEADLINE = "2026-09-03T15:00:00.000Z";
const MINUTE = 60_000;
const store = () => useTakeTestStore.getState();

function reply() {
  const at = new Date().toISOString();
  return { serverTime: at, savedAt: at, deadlineAt: DEADLINE };
}

function start() {
  store().hydrate({
    ...session({ serverTime: NOW.toISOString(), deadlineAt: DEADLINE }),
    mode: "flexible",
  });
}

/** The time on the paper each save carried, in order. */
const reported = () => saved.mock.calls.map(([, body]) => body.activeMs);

const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

function watch(
  paper: { loaded?: boolean; lock?: LockReason | null; submitState?: SubmitState } = {},
) {
  return renderHook(
    (props: { lock: LockReason | null; submitState: SubmitState }) =>
      usePaperTime({ loaded: paper.loaded ?? true, ...props }),
    {
      initialProps: {
        lock: paper.lock ?? null,
        submitState: paper.submitState ?? "idle",
      },
    },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sessionStorage.clear();
  store().reset();
  saved.mockReset().mockImplementation(async () => reply());
  submitted.mockReset().mockResolvedValue({
    ...session({ serverTime: NOW.toISOString(), deadlineAt: DEADLINE }).attempt,
    status: "submitted",
    submittedAt: NOW.toISOString(),
  });
});

afterEach(() => {
  store().reset();
  act(() => useAppState.getState().closeOverlay());
  setHidden(false);
  vi.useRealTimers();
});

describe("the accumulator", () => {
  it("adds up the stretches the paper was visible, and nothing between them", () => {
    startPaperTime(1_000);
    stopPaperTime(4_000);
    startPaperTime(10_000);
    expect(paperTime(12_500)).toBe(5_500);
    stopPaperTime(12_500);
    expect(paperTime(99_000)).toBe(5_500);
  });

  it("keeps what accrued while a save was out when the save is acknowledged", () => {
    startPaperTime(0);
    const sent = paperTime(20_000);
    settlePaperTime(sent, 23_000);
    expect(paperTime(23_000)).toBe(3_000);
    expect(paperTime(25_000)).toBe(5_000);
  });

  it("reports at most the contract's ten minutes at once, and keeps the rest", () => {
    startPaperTime(0);
    stopPaperTime(ACTIVE_MS_MAX + 7_000);
    expect(reportablePaperTime()).toBe(ACTIVE_MS_MAX);
    settlePaperTime(ACTIVE_MS_MAX);
    expect(paperTime()).toBe(7_000);
  });

  it("never counts backwards when the device's clock does", () => {
    startPaperTime(10_000);
    stopPaperTime(4_000);
    expect(paperTime()).toBe(0);
  });
});

describe("usePaperTime", () => {
  it("counts while the paper is visible and stops when the tab is hidden", () => {
    const hook = watch();
    vi.setSystemTime(NOW.getTime() + 5_000);
    setHidden(true);
    vi.setSystemTime(NOW.getTime() + 65_000);
    expect(paperTime()).toBe(5_000);
    setHidden(false);
    vi.setSystemTime(NOW.getTime() + 67_000);
    expect(paperTime()).toBe(7_000);
    hook.unmount();
    vi.setSystemTime(NOW.getTime() + 90_000);
    expect(paperTime()).toBe(7_000);
  });

  it("does not count while the maintenance or sign-in overlay covers the paper", () => {
    watch();
    vi.setSystemTime(NOW.getTime() + 2_000);
    act(() => useAppState.getState().showOverlay({ kind: "expired" }));
    vi.setSystemTime(NOW.getTime() + 40_000);
    expect(paperTime()).toBe(2_000);
    act(() => useAppState.getState().closeOverlay());
    act(() =>
      useAppState.getState().showOverlay({
        kind: "maintenance",
        window: { startsAt: NOW.toISOString(), endsAt: DEADLINE },
      }),
    );
    vi.setSystemTime(NOW.getTime() + 80_000);
    expect(paperTime()).toBe(2_000);
  });

  it("counts under the update prompt, which leaves the paper usable", () => {
    watch();
    act(() => useAppState.getState().showOverlay({ kind: "update" }));
    vi.setSystemTime(NOW.getTime() + 3_000);
    expect(paperTime()).toBe(3_000);
  });

  it("does not count before the paper loads, once it is locked or while it is handed in", () => {
    watch({ loaded: false });
    vi.setSystemTime(NOW.getTime() + 3_000);
    expect(paperTime()).toBe(0);

    const hook = watch();
    vi.setSystemTime(NOW.getTime() + 4_000);
    hook.rerender({ lock: "superseded", submitState: "idle" });
    vi.setSystemTime(NOW.getTime() + 9_000);
    expect(paperTime()).toBe(1_000);
    hook.rerender({ lock: null, submitState: "inFlight" });
    vi.setSystemTime(NOW.getTime() + 20_000);
    expect(paperTime()).toBe(1_000);
  });
});

describe("reporting the time on the paper", () => {
  it("sends it with a save and takes it off only once the save is acknowledged", async () => {
    start();
    startPaperTime(NOW.getTime());
    saved.mockRejectedValueOnce(new Error("offline"));
    vi.setSystemTime(NOW.getTime() + 8_000);
    store().setAnswer("q1", text("parks"));
    await pass(FLUSH_DEBOUNCE_MS);
    expect(reported()).toEqual([9_500]);
    expect(paperTime()).toBe(9_500);

    await pass(2_000);
    expect(reported()).toEqual([9_500, 11_500]);
    expect(paperTime()).toBe(0);
    expect(saved.mock.calls[1]?.[1].answers).toEqual({ q1: text("parks") });
  });

  it("leaves activeMs out when no time has accrued", async () => {
    start();
    store().setAnswer("q1", text("parks"));
    await pass(FLUSH_DEBOUNCE_MS);
    expect(saved.mock.calls[0]?.[1]).not.toHaveProperty("activeMs");
  });

  it("saves at least once a minute while time accrues, with no answer to send", async () => {
    start();
    startPaperTime(NOW.getTime());
    await pass(REPORT_EVERY_MS - 1_000);
    expect(saved).not.toHaveBeenCalled();
    await pass(1_000);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]?.[1]).toEqual({
      sessionId: "ses-1",
      answers: {},
      activeMs: REPORT_EVERY_MS,
    });
    await pass(REPORT_EVERY_MS);
    expect(reported()).toEqual([REPORT_EVERY_MS, REPORT_EVERY_MS]);
  });

  it("counts the minute from the last acknowledged save", async () => {
    start();
    startPaperTime(NOW.getTime());
    await pass(40_000);
    store().setAnswer("q1", text("parks"));
    await pass(FLUSH_DEBOUNCE_MS);
    expect(saved).toHaveBeenCalledTimes(1);
    await pass(REPORT_EVERY_MS - 1_000);
    expect(saved).toHaveBeenCalledTimes(1);
    await pass(1_000);
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it("sends nothing on the minute while the paper has not been visible", async () => {
    start();
    await pass(5 * MINUTE);
    expect(saved).not.toHaveBeenCalled();
  });

  it("stops reporting once the paper is locked", async () => {
    start();
    startPaperTime(NOW.getTime());
    act(() => store().lockNow("superseded"));
    await pass(3 * MINUTE);
    expect(saved).not.toHaveBeenCalled();
  });

  it("keeps the minute going after a report that failed", async () => {
    start();
    startPaperTime(NOW.getTime());
    saved.mockRejectedValueOnce(new Error("offline"));
    await pass(REPORT_EVERY_MS);
    expect(saved).toHaveBeenCalledTimes(1);
    await pass(REPORT_EVERY_MS);
    expect(saved).toHaveBeenCalledTimes(2);
    expect(paperTime()).toBe(0);
  });

  it("reports it before a hand-in by the student, even with nothing else unsaved", async () => {
    start();
    startPaperTime(NOW.getTime());
    vi.setSystemTime(NOW.getTime() + 12_000);
    await act(() => store().submit("manual"));
    expect(reported()).toEqual([12_000]);
    expect(submitted).toHaveBeenCalledWith("att-1", { reason: "manual" });
  });

  it("goes straight to the hand-in at the deadline, which would refuse the save", async () => {
    start();
    startPaperTime(NOW.getTime());
    vi.setSystemTime(NOW.getTime() + 12_000);
    await act(() => store().submit("timer_expired"));
    expect(saved).not.toHaveBeenCalled();
    expect(submitted).toHaveBeenCalledWith("att-1", { reason: "timer_expired" });
  });

  it("forgets the time when the engine lets go of the attempt", () => {
    start();
    startPaperTime(NOW.getTime());
    vi.setSystemTime(NOW.getTime() + 5_000);
    store().reset();
    expect(paperTime()).toBe(0);
  });
});

afterEach(() => resetPaperTime());
