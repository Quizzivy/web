import { fold } from "@/lib/fold";
import type {
  AttendanceMarkInput,
  AttendanceStatus,
  AttendanceStudent,
} from "@/features/attendance/api";

/** Mark is a student's status and note as the register shows them. */
export type Mark = Readonly<{ status: AttendanceStatus | null; note: string | null }>;

/** Edits are the marks changed on this page and not saved, by student id. */
export type Edits = ReadonlyMap<string, Mark>;

/** Filter is a legend filter: one status, or the students with none. */
export type Filter = AttendanceStatus | "none";

/** Counts are the roster by its marks as they stand on the page. */
export type Counts = Readonly<Record<Filter, number>>;

/** STATUSES are the three marks in the register's order. */
export const STATUSES: readonly AttendanceStatus[] = ["present", "late", "absent"];

/** markOf is the mark a student shows: the page's edit, else the stored one. */
export function markOf(student: AttendanceStudent, edits: Edits): Mark {
  return edits.get(student.studentId) ?? { status: student.status, note: student.note };
}

function differs(student: AttendanceStudent, mark: Mark): boolean {
  return mark.status !== student.status || mark.note !== student.note;
}

/** changedStudents are the students whose mark on the page differs from the stored one. */
export function changedStudents(
  students: readonly AttendanceStudent[],
  edits: Edits,
): AttendanceStudent[] {
  return students.filter((student) => differs(student, markOf(student, edits)));
}

/** countsOf counts the roster by the marks it shows. */
export function countsOf(students: readonly AttendanceStudent[], edits: Edits): Counts {
  const counts = { present: 0, late: 0, absent: 0, none: 0 };
  for (const student of students) counts[markOf(student, edits).status ?? "none"] += 1;
  return counts;
}

/**
 * withMarks returns `edits` with `status` set for each student of `ids`.
 * Clearing a status clears its note, as the server does.
 */
export function withMarks(
  students: readonly AttendanceStudent[],
  edits: Edits,
  ids: Iterable<string>,
  status: AttendanceStatus | null,
): Edits {
  const next = new Map(edits);
  const wanted = new Set(ids);
  for (const student of students) {
    if (!wanted.has(student.studentId)) continue;
    const mark = markOf(student, edits);
    next.set(student.studentId, {
      status,
      note: status === null ? null : mark.note,
    });
  }
  return next;
}

/** withNote returns `edits` with a student's note set; an empty note is none. */
export function withNote(
  student: AttendanceStudent,
  edits: Edits,
  note: string,
): Edits {
  const mark = markOf(student, edits);
  if (mark.status === null) return edits;
  const text = note.trim();
  const next = new Map(edits);
  next.set(student.studentId, { status: mark.status, note: text === "" ? null : text });
  return next;
}

/**
 * restPresent is what "Mark all present" does: with some students marked and
 * some not, it marks only the rest ("Mark the rest present"); otherwise it
 * marks everyone present.
 */
export function restPresent(
  students: readonly AttendanceStudent[],
  edits: Edits,
): Edits {
  const unmarked = students.filter((student) => markOf(student, edits).status === null);
  const some = unmarked.length > 0 && unmarked.length < students.length;
  const ids = (some ? unmarked : students).map((student) => student.studentId);
  return withMarks(students, edits, ids, "present");
}

/**
 * marksToSave is the save's body: one mark per changed student. A note is
 * sent only when it changed, and never beside a cleared status, whose note
 * the server removes with it.
 */
export function marksToSave(
  students: readonly AttendanceStudent[],
  edits: Edits,
): AttendanceMarkInput[] {
  return changedStudents(students, edits).map((student) => {
    const mark = markOf(student, edits);
    if (mark.status === null) return { studentId: student.studentId, status: null };
    return mark.note === student.note
      ? { studentId: student.studentId, status: mark.status }
      : { studentId: student.studentId, status: mark.status, note: mark.note };
  });
}

/** shownStudents are the roster under the search, accents aside, and the legend filter. */
export function shownStudents(
  students: readonly AttendanceStudent[],
  edits: Edits,
  search: string,
  filter: Filter | null,
): AttendanceStudent[] {
  const wanted = fold(search.trim());
  return students.filter(
    (student) =>
      (wanted === "" || fold(student.fullName).includes(wanted)) &&
      (filter === null || (markOf(student, edits).status ?? "none") === filter),
  );
}
