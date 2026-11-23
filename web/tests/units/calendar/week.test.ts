import { describe, expect, it } from "vitest";
import {
  addDays,
  eventBox,
  hourRange,
  isoWeekOf,
  itemsByDay,
  lanes,
  mondayOf,
  mondayOfIsoWeek,
  nowTop,
  openingHour,
  weekDays,
} from "@/features/calendar/week";
import type { Calendar, ClassSession } from "@/features/calendar/api";

describe("the calendar's weeks", () => {
  it("names a week as ISO 8601 does and reads the name back to its Monday", () => {
    expect(mondayOf("2026-09-24")).toBe("2026-09-21");
    expect(isoWeekOf("2026-09-24")).toBe("2026-W39");
    expect(mondayOfIsoWeek("2026-W39")).toBe("2026-09-21");
    expect(mondayOfIsoWeek("2025-W39")).toBe("2025-09-22");
  });

  it("keeps a week whole across the year's end, with the year its Thursday has", () => {
    expect(isoWeekOf("2027-01-01")).toBe("2026-W53");
    expect(mondayOfIsoWeek("2026-W53")).toBe("2026-12-28");
    expect(isoWeekOf("2027-01-04")).toBe("2027-W01");
    expect(isoWeekOf("2025-12-29")).toBe("2026-W01");
  });

  it("round-trips every week of three years", () => {
    let monday = "2025-01-06";
    for (let week = 0; week < 156; week++) {
      expect(mondayOfIsoWeek(isoWeekOf(monday))).toBe(monday);
      monday = addDays(monday, 7);
    }
  });

  it("refuses a name it cannot read, or a week its year does not have", () => {
    for (const name of [
      null,
      "",
      "2026-39",
      "2026-W0",
      "2026-W00",
      "2027-W53",
      "2026-W54",
    ])
      expect(mondayOfIsoWeek(name)).toBeNull();
  });

  it("lists a week's seven days from Monday, across a month's end", () => {
    expect(weekDays("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("the week grid's geometry", () => {
  it("places an event as the deck does: 1px under its start, 3px short, 44px an hour", () => {
    expect(eventBox({ start: 18 * 60, minutes: 90 }, 8)).toEqual({
      top: 10 * 44 + 1,
      height: 1.5 * 44 - 3,
    });
  });

  it("never draws an event under 36px, so its title and time both show", () => {
    expect(eventBox({ start: 8 * 60, minutes: 45 }, 8)).toEqual({ top: 1, height: 36 });
  });

  it("shows 08:00 to 22:00 for an ordinary week", () => {
    expect(hourRange([{ start: 18 * 60, minutes: 90 }])).toEqual({
      first: 8,
      last: 22,
    });
    expect(hourRange([])).toEqual({ first: 8, last: 22 });
  });

  it("grows to whole hours for a 07:00 session and one that ends at 22:30", () => {
    const range = hourRange([
      { start: 7 * 60, minutes: 90 },
      { start: 21 * 60, minutes: 90 },
    ]);
    expect(range).toEqual({ first: 7, last: 23 });
    expect(eventBox({ start: 7 * 60, minutes: 90 }, range.first).top).toBe(1);
  });

  it("grows for a test that closes at 21:30, whose least height reaches past 22:00", () => {
    expect(hourRange([{ start: 21 * 60 + 30, minutes: 45 }]).last).toBe(23);
    expect(hourRange([{ start: 21 * 60, minutes: 45 }]).last).toBe(22);
  });

  it("opens on 08:00, or on an earlier first session, never above the grid's first hour", () => {
    const evening = { start: 18 * 60, minutes: 90 };
    expect(openingHour([evening], { first: 8, last: 22 })).toBe(8);
    expect(openingHour([], { first: 8, last: 22 })).toBe(8);
    // A test closing at 02:45 grows the grid to 02:00; the card still opens on 08:00.
    expect(openingHour([evening], { first: 2, last: 22 })).toBe(8);
    expect(
      openingHour([{ start: 7 * 60, minutes: 90 }, evening], { first: 2, last: 22 }),
    ).toBe(7);
    expect(
      openingHour([{ start: 6 * 60 + 30, minutes: 60 }], { first: 6, last: 22 }),
    ).toBe(6);
  });

  it("puts the now-line where the minute falls, and nowhere outside the hours", () => {
    expect(nowTop(20 * 60 + 15, { first: 8, last: 22 })).toBe(12.25 * 44);
    expect(nowTop(6 * 60, { first: 8, last: 22 })).toBeNull();
  });

  it("shares the width between events that overlap, and only between them", () => {
    expect(
      lanes([
        { start: 18 * 60, minutes: 90 },
        { start: 18 * 60 + 30, minutes: 60 },
        { start: 21 * 60, minutes: 45 },
      ]),
    ).toEqual([
      { index: 0, count: 2 },
      { index: 1, count: 2 },
      { index: 0, count: 1 },
    ]);
  });
});

const SESSION: ClassSession = {
  id: "019535d9-3df7-79fb-b466-fa907fa17f9e.20250924",
  classId: "019535d9-3df7-79fb-b466-fa907fa17f01",
  className: "IELTS 6.5 Evening",
  seriesId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
  series: null,
  date: "2025-09-24",
  startsAt: "2025-09-24T11:00:00Z",
  durationMinutes: 90,
  room: "Phòng 2",
  note: null,
  cancelled: false,
  changed: false,
  hasAttendance: false,
};

describe("a week's items", () => {
  it("sorts sessions and moments into their days on the zone's wall clock", () => {
    const calendar: Calendar = {
      sessions: [SESSION, { ...SESSION, id: "late", startsAt: "2025-09-24T17:30:00Z" }],
      assignmentEvents: [
        {
          kind: "opens",
          at: "2025-09-24T01:00:00Z",
          assignmentId: "019535d9-3df7-79fb-b466-fa907fa17f02",
          title: "Reading Mock",
          classNames: ["IELTS 6.5 Evening"],
        },
      ],
      terms: [],
    };
    const days = weekDays("2025-09-22");
    const items = itemsByDay(calendar, days, "Asia/Ho_Chi_Minh");
    expect(items[2]!.map((item) => [item.kind, item.span.start])).toEqual([
      ["opens", 8 * 60],
      ["session", 18 * 60],
    ]);
    expect(items[3]!.map((item) => [item.kind, item.span.start])).toEqual([
      ["session", 30],
    ]);
  });
});
