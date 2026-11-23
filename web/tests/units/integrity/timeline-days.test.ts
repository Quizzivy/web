import { describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import type { IntegrityEvent } from "@/features/attempts/api";
import {
  datedRows,
  dayClockSpan,
  longSpan,
  minutesLabel,
  timelineRows,
} from "@/features/integrity/timeline";
import { timelineMark } from "@/features/integrity/tones";

const SESSION = "018f0000-0000-7000-8000-00000000ab01";
const ZONE = "Asia/Ho_Chi_Minh";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function event(
  over: Partial<IntegrityEvent> & { id: number; kind: string; occurredAt: string },
): IntegrityEvent {
  return { offsetMs: 0, clientSeq: over.id, sessionId: SESSION, ...over };
}

describe("a break on the timeline (F1)", () => {
  const events = [
    event({ id: 1, kind: "paper_left", occurredAt: "2026-09-22T12:15:02Z" }),
    event({ id: 2, kind: "resume", occurredAt: "2026-09-23T13:31:40Z" }),
    event({ id: 3, kind: "page_hide", occurredAt: "2026-09-23T13:44:30Z" }),
    event({ id: 4, kind: "paper_left", occurredAt: "2026-09-23T13:50:00Z" }),
  ];

  it("runs a break to the next resume, keeps the resume and the closed page, and leaves an unresumed break without a span", () => {
    const rows = timelineRows(events, "all");
    expect(rows.map((row) => [row.event.kind, row.breakMs])).toEqual([
      ["paper_left", DAY + HOUR + 16 * MINUTE + 38_000],
      ["resume", null],
      ["page_hide", null],
      ["paper_left", null],
    ]);
    expect(rows.every((row) => !row.ongoing)).toBe(true);
  });

  it("ends a break at a resume in another tab or device too", () => {
    const rows = timelineRows(
      [
        events[0]!,
        event({ id: 2, kind: "session_takeover", occurredAt: "2026-09-22T12:45:02Z" }),
      ],
      "all",
    );
    expect(rows[0]?.breakMs).toBe(30 * MINUTE);
  });

  it("ends a break at the same tab's return to the paper, which draws no row of its own", () => {
    const rows = timelineRows(
      [
        events[0]!,
        event({ id: 2, kind: "paper_returned", occurredAt: "2026-09-22T12:40:02Z" }),
        event({
          id: 3,
          kind: "tab_hidden",
          occurredAt: "2026-09-22T12:41:00Z",
          durationMs: 4_000,
        }),
        event({ id: 4, kind: "tab_visible", occurredAt: "2026-09-22T12:41:04Z" }),
      ],
      "all",
    );
    expect(rows.map((row) => [row.event.kind, row.breakMs])).toEqual([
      ["paper_left", 25 * MINUTE],
      ["tab_hidden", null],
    ]);
  });

  it("is not stretched by a later move to another device, whose takeover the old session writes last", () => {
    // The server orders a session's takeover after its own events, and the
    // new session's resume after the old session.
    const rows = timelineRows(
      [
        events[0]!,
        event({ id: 2, kind: "paper_returned", occurredAt: "2026-09-22T12:25:02Z" }),
        event({ id: 3, kind: "session_takeover", occurredAt: "2026-09-22T13:15:02Z" }),
        event({
          id: 4,
          kind: "resume",
          occurredAt: "2026-09-22T13:15:02Z",
          sessionId: "018f0000-0000-7000-8000-00000000ab02",
        }),
      ],
      "all",
    );
    expect(rows.map((row) => [row.event.kind, row.breakMs])).toEqual([
      ["paper_left", 10 * MINUTE],
      ["session_takeover", null],
      ["resume", null],
    ]);
  });

  it("is not an absence: no chip narrows to it and its dot is neutral, as a closed page's", () => {
    expect(timelineRows(events, "away")).toEqual([]);
    expect(timelineMark("paper_left")).toBe("other");
    expect(timelineMark("page_hide")).toBe("other");
    expect(timelineMark("resume")).toBe("other");
  });
});

describe("datedRows", () => {
  it("dates the first moment of each day once the attempt spans days", () => {
    const shown = [
      "2026-09-22T12:02:10Z",
      "2026-09-22T12:09:44Z",
      "2026-09-23T13:31:40Z",
      "2026-09-23T13:38:15Z",
      "2026-09-24T12:58:03Z",
    ];
    expect(datedRows(shown, shown, ZONE)).toEqual([true, false, true, false, true]);
  });

  it("dates nothing while the attempt keeps to one day in the zone", () => {
    // 23:50 and 00:10 UTC are 06:50 and 07:10 the same morning in Hồ Chí Minh City.
    const shown = ["2026-09-22T23:50:00Z", "2026-09-23T00:10:00Z"];
    expect(datedRows(shown, shown, ZONE)).toEqual([false, false]);
  });

  it("reads the attempt's own days, not only the rows a filter shows", () => {
    expect(
      datedRows(
        ["2026-09-22T12:02:10Z"],
        ["2026-09-22T12:02:10Z", "2026-09-23T13:31:40Z"],
        ZONE,
      ),
    ).toEqual([true]);
  });
});

describe("spans past a day", () => {
  it("puts whole days in front of the clock past 24 hours", () => {
    expect(dayClockSpan(DAY + HOUR + 29 * MINUTE + 30_000)).toEqual({
      days: 1,
      clock: "01:29:30",
    });
    expect(dayClockSpan(25 * MINUTE)).toEqual({ days: 0, clock: "25:00" });
    expect(dayClockSpan(23 * HOUR)).toEqual({ days: 0, clock: "23:00:00" });
  });

  it("words minutes, then hours, then days and hours", () => {
    const vi = i18n.getFixedT("vi");
    expect(longSpan(20_000, vi)).toBe("dưới 1 phút");
    expect(longSpan(52 * MINUTE, vi)).toBe("52 phút");
    expect(longSpan(3 * HOUR + 10 * MINUTE, vi)).toBe("3 giờ");
    expect(longSpan(2 * DAY + HOUR, vi)).toBe("2 ngày 1 giờ");
    expect(longSpan(2 * DAY + 2 * HOUR + 20 * MINUTE, i18n.getFixedT("en"))).toBe(
      "2 days 2 hours",
    );
    expect(minutesLabel(null, vi)).toBe("—");
    expect(minutesLabel(0, vi)).toBe("dưới 1 phút");
    expect(minutesLabel(40, vi)).toBe("40 phút");
  });
});
