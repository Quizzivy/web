import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { flushByBeacon } from "@/features/integrity/beacon";
import {
  beginSession,
  clearSession,
  pending,
  record,
} from "@/features/integrity/buffer";
import { releaseSession } from "@/features/integrity/release";
import { useIntegrityMonitor } from "@/features/integrity/useIntegrityMonitor";
import {
  ACTIVE_MS_MAX,
  paperTime,
  resetPaperTime,
  startPaperTime,
  stopPaperTime,
} from "@/features/take-test/activeTime";
import type { IntegrityPolicy } from "@/features/take-test/api";

const ATTEMPT = "att-1";
const NOW = new Date("2026-09-01T08:00:00.000Z").getTime();
const policy: IntegrityPolicy = {
  requireFullscreen: false,
  blockCopyPaste: true,
  maxFocusLoss: 0,
  onLimitExceeded: "flag",
  minAwayMs: 3000,
};

let sent: { url: string; body: Blob }[] = [];
let accept = true;

async function bodies(): Promise<Record<string, unknown>[]> {
  return Promise.all(
    sent.map(
      async ({ body }) => JSON.parse(await body.text()) as Record<string, unknown>,
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true, now: NOW });
  sessionStorage.clear();
  clearSession(ATTEMPT);
  resetPaperTime();
  sent = [];
  accept = true;
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: vi.fn((url: string, body: Blob) => {
      if (!accept) return false;
      sent.push({ url, body });
      return true;
    }),
  });
});

afterEach(() => {
  resetPaperTime();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("time on the paper in the beacon's body", () => {
  it("rides with the events on pagehide", async () => {
    renderHook(() =>
      useIntegrityMonitor({
        attemptId: ATTEMPT,
        sessionId: "ses-1",
        beaconToken: "the-beacon-token",
        policy,
      }),
    );
    startPaperTime(NOW);
    stopPaperTime(NOW + 42_000);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    });
    const [body, ...others] = await bodies();
    expect(others).toEqual([]);
    expect(body).toMatchObject({
      beaconToken: "the-beacon-token",
      sessionId: "ses-1",
      activeMs: 42_000,
    });
    expect((body?.["events"] as { kind: string }[]).map((e) => e.kind)).toEqual([
      "page_hide",
    ]);
  });

  it("goes alone when nothing else is buffered", async () => {
    beginSession(ATTEMPT, "ses-1");
    startPaperTime(NOW);
    stopPaperTime(NOW + 9_000);
    expect(
      flushByBeacon({ attemptId: ATTEMPT, sessionId: "ses-1", beaconToken: "b" }),
    ).toBe(true);
    expect(await bodies()).toEqual([
      { beaconToken: "b", sessionId: "ses-1", events: [], activeMs: 9_000 },
    ]);
  });

  it("is left out, and no beacon sent, when there is neither time nor an event", async () => {
    beginSession(ATTEMPT, "ses-1");
    flushByBeacon({ attemptId: ATTEMPT, sessionId: "ses-1", beaconToken: "b" });
    expect(sent).toEqual([]);

    record(ATTEMPT, "window_blur");
    flushByBeacon({ attemptId: ATTEMPT, sessionId: "ses-1", beaconToken: "b" });
    const [body] = await bodies();
    expect(body).not.toHaveProperty("activeMs");
  });

  it("carries at most the contract's ten minutes", async () => {
    beginSession(ATTEMPT, "ses-1");
    startPaperTime(NOW);
    stopPaperTime(NOW + ACTIVE_MS_MAX + 30_000);
    flushByBeacon({ attemptId: ATTEMPT, sessionId: "ses-1", beaconToken: "b" });
    const [body] = await bodies();
    expect(body?.["activeMs"]).toBe(ACTIVE_MS_MAX);
  });

  it("stays counted after the beacon, since only an acknowledged save settles it", () => {
    beginSession(ATTEMPT, "ses-1");
    startPaperTime(NOW);
    stopPaperTime(NOW + 5_000);
    flushByBeacon({ attemptId: ATTEMPT, sessionId: "ses-1", beaconToken: "b" });
    expect(paperTime()).toBe(5_000);
  });

  it("keeps the events buffered when the browser refuses the beacon", () => {
    beginSession(ATTEMPT, "ses-1");
    record(ATTEMPT, "window_blur");
    startPaperTime(NOW);
    stopPaperTime(NOW + 5_000);
    accept = false;
    expect(
      flushByBeacon({ attemptId: ATTEMPT, sessionId: "ses-1", beaconToken: "b" }),
    ).toBe(false);
    expect(pending().map((event) => event.kind)).toEqual(["window_blur"]);
  });

  it("goes with what the engine releases as it unmounts mid-attempt", async () => {
    beginSession(ATTEMPT, "ses-1");
    startPaperTime(NOW);
    stopPaperTime(NOW + 3_000);
    releaseSession({
      attemptId: ATTEMPT,
      sessionId: "ses-1",
      beaconToken: "b",
      ended: false,
    });
    expect(await bodies()).toEqual([
      { beaconToken: "b", sessionId: "ses-1", events: [], activeMs: 3_000 },
    ]);
  });
});
