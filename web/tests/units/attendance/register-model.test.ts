import { describe, expect, it } from "vitest";
import {
  changedStudents,
  countsOf,
  marksToSave,
  restPresent,
  shownStudents,
  withMarks,
  withNote,
  type Edits,
} from "@/features/attendance/register";
import { dayLabel, notOpenYet, startOfDay } from "@/features/attendance/dates";
import { ANH, BAO, HA, NAM, roster } from "./support";

const NONE: Edits = new Map();

function marked() {
  return roster().map((student, index) =>
    index === 0 ? { ...student, status: "late" as const, note: "Kẹt xe" } : student,
  );
}

describe("the register's marks", () => {
  it("counts the roster by the marks it shows, the page's edits over the stored ones", () => {
    const students = marked();
    expect(countsOf(students, NONE)).toEqual({
      present: 0,
      late: 1,
      absent: 0,
      none: 3,
    });
    const edits = withMarks(students, NONE, [NAM, BAO], "absent");
    expect(countsOf(students, edits)).toEqual({
      present: 0,
      late: 1,
      absent: 2,
      none: 1,
    });
    expect(changedStudents(students, edits).map((s) => s.studentId)).toEqual([
      NAM,
      BAO,
    ]);
  });

  it("sends a note only when it changed, and none beside a cleared mark", () => {
    const students = marked();
    let edits = withMarks(students, NONE, [NAM], "present");
    edits = withNote(students[1]!, edits, "  Về sớm  ");
    edits = withMarks(students, edits, [BAO], "absent");
    expect(marksToSave(students, edits)).toEqual([
      { studentId: NAM, status: "present", note: "Về sớm" },
      { studentId: BAO, status: "absent" },
    ]);

    const cleared = withMarks(students, NONE, [ANH], null);
    expect(marksToSave(students, cleared)).toEqual([{ studentId: ANH, status: null }]);

    const noteRemoved = withNote(students[0]!, NONE, "");
    expect(marksToSave(students, noteRemoved)).toEqual([
      { studentId: ANH, status: "late", note: null },
    ]);
  });

  it("takes no note for a student with no mark, and drops a change put back", () => {
    const students = roster();
    expect(withNote(students[0]!, NONE, "x")).toBe(NONE);
    const back = withMarks(
      students,
      withMarks(students, NONE, [HA], "late"),
      [HA],
      null,
    );
    expect(changedStudents(students, back)).toEqual([]);
  });

  it("marks only the rest present once some are marked, and everyone otherwise", () => {
    const students = marked();
    const rest = restPresent(students, NONE);
    expect(countsOf(students, rest)).toEqual({
      present: 3,
      late: 1,
      absent: 0,
      none: 0,
    });
    const all = restPresent(students, rest);
    expect(countsOf(students, all)).toEqual({
      present: 4,
      late: 0,
      absent: 0,
      none: 0,
    });
  });

  it("finds a student by name, accents aside, and by the legend's filter", () => {
    const students = marked();
    expect(shownStudents(students, NONE, "bao", null).map((s) => s.fullName)).toEqual([
      "Nguyễn Gia Bảo",
    ]);
    expect(shownStudents(students, NONE, "", "late").map((s) => s.studentId)).toEqual([
      ANH,
    ]);
    expect(shownStudents(students, NONE, "", "none")).toHaveLength(3);
  });
});

describe("the register's dates", () => {
  it("names a day as the schedule does, and finds the day's start in the display zone", () => {
    expect(dayLabel("2026-09-24T11:00:00Z", "vi")).toBe("Th 5, 24 thg 9");
    expect(dayLabel("2026-09-20T02:00:00Z", "vi")).toBe("CN, 20 thg 9");
    expect(dayLabel("2026-09-24T11:00:00Z", "en")).toBe("Thu 24 Sep");
    expect(startOfDay(new Date("2026-09-24T13:15:00Z")).toISOString()).toBe(
      "2026-09-23T17:00:00.000Z",
    );
  });

  it("opens a register 15 minutes before its session", () => {
    const now = new Date("2026-09-24T10:45:00Z");
    expect(notOpenYet("2026-09-24T11:00:00Z", now)).toBe(false);
    expect(notOpenYet("2026-09-24T11:00:01Z", now)).toBe(true);
  });
});
