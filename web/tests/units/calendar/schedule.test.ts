import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDateRange,
  formatDayLabel,
  formatDayMonth,
  formatLongDate,
  formatSlots,
  formatTimeRange,
  minutesOf,
  wallClock,
  weekdayAbbr,
  weekdayColumn,
  weekdayInSentence,
  weekdayOf,
} from "@/lib/i18n/schedule";

const EVENING = [1, 3, 5].map((weekday) => ({
  weekday,
  startTime: "18:00",
  durationMinutes: 90,
}));

describe("lib/i18n/schedule: a class's weekly slots", () => {
  it("reads one time as its days, then the time, in both languages", () => {
    expect(formatSlots(EVENING, "vi")).toBe("T2 · T4 · T6, 18:00");
    expect(formatSlots(EVENING, "en")).toBe("Mon · Wed · Fri, 18:00");
  });

  it("joins several times by their earliest day, whatever order the slots come in", () => {
    const slots = [
      { weekday: 6, startTime: "09:00" },
      { weekday: 3, startTime: "18:00" },
      { weekday: 1, startTime: "18:00" },
    ];
    expect(formatSlots(slots, "vi")).toBe("T2 · T4, 18:00; T7, 09:00");
    expect(formatSlots(slots, "en")).toBe("Mon · Wed, 18:00; Sat, 09:00");
  });

  it("says each day once, names Sunday, and gives nothing for no slot", () => {
    const slots = [
      { weekday: 7, startTime: "09:00" },
      { weekday: 7, startTime: "09:00" },
    ];
    expect(formatSlots(slots, "vi")).toBe("CN, 09:00");
    expect(formatSlots(slots, "en")).toBe("Sun, 09:00");
    expect(formatSlots([], "vi")).toBe("");
  });

  it("names a day three ways: in a line, over a column, inside a sentence", () => {
    expect([1, 7].map((day) => weekdayAbbr(day, "vi"))).toEqual(["T2", "CN"]);
    expect([1, 7].map((day) => weekdayColumn(day, "vi"))).toEqual(["Th 2", "CN"]);
    expect([1, 7].map((day) => weekdayInSentence(day, "vi"))).toEqual([
      "thứ Hai",
      "Chủ nhật",
    ]);
    expect([1, 7].map((day) => weekdayColumn(day, "en"))).toEqual(["Mon", "Sun"]);
    expect([1, 7].map((day) => weekdayInSentence(day, "en"))).toEqual([
      "Monday",
      "Sunday",
    ]);
  });
});

describe("lib/i18n/schedule: weeks and days", () => {
  it("heads the deck's week as the plan writes it", () => {
    expect(formatDateRange("2025-09-22", "2025-09-28", "vi")).toBe("22 – 28 tháng 9");
    expect(formatDateRange("2025-09-22", "2025-09-28", "en")).toBe("22 – 28 September");
  });

  it("names both months across a month's end, and both years across a year's", () => {
    expect(formatDateRange("2026-09-28", "2026-10-04", "vi")).toBe(
      "28 tháng 9 – 4 tháng 10",
    );
    expect(formatDateRange("2026-09-28", "2026-10-04", "en")).toBe(
      "28 September – 4 October",
    );
    expect(formatDateRange("2026-12-28", "2027-01-03", "vi")).toBe(
      "28 tháng 12 năm 2026 – 3 tháng 1 năm 2027",
    );
    expect(formatDateRange("2026-12-28", "2027-01-03", "en")).toBe(
      "28 December 2026 – 3 January 2027",
    );
  });

  it("heads a day of the agenda, and writes a date in a sentence", () => {
    expect(weekdayOf("2025-09-24")).toBe(3);
    expect(weekdayOf("2025-09-28")).toBe(7);
    expect(formatDayLabel("2025-09-24", "vi")).toBe("Th 4, 24 thg 9");
    expect(formatDayLabel("2025-09-24", "en")).toBe("Wed 24 Sep");
    expect(formatDayMonth("2026-12-19", "vi")).toBe("19 thg 12");
    expect(formatLongDate("2025-09-26", "vi")).toBe("Thứ Sáu, 26 tháng 9");
    expect(formatLongDate("2025-09-28", "vi")).toBe("Chủ nhật, 28 tháng 9");
    expect(formatLongDate("2025-09-26", "en")).toBe("Friday, 26 September");
    expect(formatDayMonth("2026-12-19", "en", { year: true })).toBe("19 Dec 2026");
  });
});

describe("lib/i18n/schedule: times", () => {
  it("writes the 24-hour clock and a session's range", () => {
    expect(minutesOf("07:05")).toBe(425);
    expect(formatClock(425)).toBe("07:05");
    expect(formatClock(24 * 60 + 30)).toBe("00:30");
    expect(formatTimeRange(18 * 60, 90)).toBe("18:00 – 19:30");
  });

  it("reads an instant on a zone's wall clock, the day included", () => {
    expect(wallClock("2025-09-24T13:15:00Z", "Asia/Ho_Chi_Minh")).toEqual({
      date: "2025-09-24",
      minutes: 20 * 60 + 15,
    });
    expect(wallClock("2025-09-24T18:30:00Z", "Asia/Ho_Chi_Minh")).toEqual({
      date: "2025-09-25",
      minutes: 90,
    });
    expect(wallClock("2025-09-24T18:30:00Z", "Asia/Tokyo").minutes).toBe(3 * 60 + 30);
  });
});
