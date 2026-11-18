import { describe, expect, it } from "vitest";
import { paperTime } from "@/features/assignments/pages/teacher/assignmentDetail";

const startedAt = "2026-09-22T12:02:10Z";

describe("paperTime (F1)", () => {
  it("reads the time on the paper, with the span from start to hand-in when it is another minute", () => {
    expect(
      paperTime({
        startedAt,
        submittedAt: "2026-09-24T13:14:22Z",
        activeSeconds: 2400,
      }),
    ).toEqual({ onPaper: true, minutes: 40, spanMs: 2 * 86_400_000 + 4_332_000 });
  });

  it("leaves the span out when both come to the same minute", () => {
    expect(
      paperTime({
        startedAt,
        submittedAt: "2026-09-22T12:54:10Z",
        activeSeconds: 3110,
      }),
    ).toEqual({ onPaper: true, minutes: 52, spanMs: null });
  });

  it("shows the time so far and no span while the attempt is in progress", () => {
    expect(paperTime({ startedAt, submittedAt: null, activeSeconds: 540 })).toEqual({
      onPaper: true,
      minutes: 9,
      spanMs: null,
    });
    expect(paperTime({ startedAt, activeSeconds: 0 })).toEqual({
      onPaper: true,
      minutes: 0,
      spanMs: null,
    });
  });

  it("falls back to the elapsed figure, as before F1, when there is no time on the paper", () => {
    expect(
      paperTime({
        startedAt,
        submittedAt: "2026-09-22T12:43:10Z",
        activeSeconds: null,
      }),
    ).toEqual({ onPaper: false, minutes: 41, spanMs: null });
    expect(paperTime({ startedAt, submittedAt: null })).toEqual({
      onPaper: false,
      minutes: null,
      spanMs: null,
    });
    expect(
      paperTime({ startedAt: null, submittedAt: null, activeSeconds: null }),
    ).toEqual({ onPaper: false, minutes: null, spanMs: null });
  });
});
