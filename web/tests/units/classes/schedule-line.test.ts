import { describe, expect, it } from "vitest";
import { derivedSchedule } from "@/features/classes/classFields";
import {
  formatSchedule,
  formatScheduleLine,
  nextSlotDate,
  type ClassScheduleLike,
} from "@/lib/i18n/schedule";

const MWF: ClassScheduleLike = {
  slots: [
    { weekday: 1, startTime: "18:00", durationMinutes: 90 },
    { weekday: 3, startTime: "18:00", durationMinutes: 90 },
    { weekday: 5, startTime: "18:00", durationMinutes: 90 },
  ],
  label: "Tối 2-4-6",
};

const TWO_TIMES: ClassScheduleLike = {
  slots: [
    { weekday: 6, startTime: "09:00", durationMinutes: 120 },
    { weekday: 1, startTime: "18:00", durationMinutes: 90 },
    { weekday: 3, startTime: "18:00", durationMinutes: 90 },
  ],
  label: null,
};

const LABEL_ONLY: ClassScheduleLike = { slots: [], label: "Thứ 3, 5 · 18:00" };
const NOTHING: ClassScheduleLike = { slots: [], label: null };

describe("lib/i18n/schedule: the line under a class's name (T-R8.14)", () => {
  it.each([
    ["vi", MWF, null, "T2 · T4 · T6, 18:00"],
    ["en", MWF, null, "Mon · Wed · Fri, 18:00"],
    ["vi", TWO_TIMES, null, "T2 · T4, 18:00; T7, 09:00"],
    ["en", TWO_TIMES, null, "Mon · Wed, 18:00; Sat, 09:00"],
    ["vi", MWF, "Phòng 2", "T2 · T4 · T6, 18:00 · Phòng 2"],
    ["en", MWF, "Room 2", "Mon · Wed · Fri, 18:00 · Room 2"],
    ["vi", LABEL_ONLY, "Phòng 2", "Thứ 3, 5 · 18:00 · Phòng 2"],
    ["en", LABEL_ONLY, null, "Thứ 3, 5 · 18:00"],
    ["vi", NOTHING, null, "Chưa có lịch học"],
    ["en", NOTHING, null, "No schedule yet"],
    ["vi", NOTHING, "Phòng 2", "Chưa có lịch học · Phòng 2"],
    ["en", null, null, "No schedule yet"],
  ] as const)("%s: %j in %s reads %s", (locale, schedule, room, line) => {
    expect(formatScheduleLine(schedule, room, locale)).toBe(line);
  });

  it("prefers the slots to the label the teacher typed before the class had sessions", () => {
    expect(formatSchedule(MWF, "vi")).toBe("T2 · T4 · T6, 18:00");
    expect(formatSchedule(LABEL_ONLY, "en")).toBe("Thứ 3, 5 · 18:00");
    expect(formatSchedule({ slots: [], label: "  " }, "vi")).toBe("");
  });

  it("says nothing of a missing schedule where no fallback is wanted (the join preview)", () => {
    const quiet = { fallback: false } as const;
    expect(formatScheduleLine(null, null, "vi", quiet)).toBe("");
    expect(formatScheduleLine(null, "Phòng 4", "vi", quiet)).toBe("Phòng 4");
    expect(formatScheduleLine(NOTHING, null, "en", quiet)).toBe("");
    expect(formatScheduleLine(MWF, "Room 4", "en", quiet)).toBe(
      "Mon · Wed · Fri, 18:00 · Room 4",
    );
  });
});

describe("lib/i18n/schedule: a class's next meeting", () => {
  it("counts today's slot until it has ended, then looks to the next one", () => {
    // Wednesday 23 September 2026.
    expect(nextSlotDate(MWF.slots, "2026-09-23", 16 * 60)).toBe("2026-09-23");
    expect(nextSlotDate(MWF.slots, "2026-09-23", 18 * 60 + 45)).toBe("2026-09-23");
    expect(nextSlotDate(MWF.slots, "2026-09-23", 19 * 60 + 30)).toBe("2026-09-25");
    // Friday evening, after class: Monday.
    expect(nextSlotDate(MWF.slots, "2026-09-25", 20 * 60)).toBe("2026-09-28");
    // Sunday: Monday, across the week's end.
    expect(nextSlotDate(TWO_TIMES.slots, "2026-09-27", 8 * 60)).toBe("2026-09-28");
    expect(nextSlotDate([], "2026-09-23", 0)).toBeNull();
  });

  it("opens the calendar at the ISO week of the next session, read in the teacher's zone", () => {
    const zone = "Asia/Ho_Chi_Minh";
    // Wednesday 23 September, 16:00 in Ho Chi Minh City.
    expect(derivedSchedule(MWF, "vi", zone, new Date("2026-09-23T09:00:00Z"))).toEqual({
      line: "T2 · T4 · T6, 18:00",
      calendar: "/teacher/calendar?week=2026-W39",
    });
    // Saturday 26 September 00:30 there, still Friday in UTC: Monday's week.
    expect(
      derivedSchedule(MWF, "en", zone, new Date("2026-09-25T17:30:00Z"))?.calendar,
    ).toBe("/teacher/calendar?week=2026-W40");
    // Thursday 31 December 2026, after class: Friday 1 January is in 2026-W53.
    expect(
      derivedSchedule(MWF, "vi", zone, new Date("2026-12-31T13:00:00Z"))?.calendar,
    ).toBe("/teacher/calendar?week=2026-W53");
    expect(derivedSchedule(LABEL_ONLY, "vi", zone, new Date())).toBeNull();
  });
});
