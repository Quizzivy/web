import { blankAsNull } from "@/features/classes/classFields";
import { formatClock, wallClock, weekdayOf } from "@/lib/i18n/schedule";
import type { ClassSession, SeriesPatch, SessionPatch, SessionSeries } from "./api";
import { addDays } from "./week";

/** SessionAction is one thing the session popover offers, in the plan's order. */
export type SessionAction =
  "attendance" | "editDate" | "cancel" | "restore" | "editSeries" | "stop" | "delete";

/** started reports whether a session has begun at `now`, its start included. */
export function started(session: ClassSession, now: number): boolean {
  return Date.parse(session.startsAt) <= now;
}

/**
 * sessionActions are the popover's actions for `session` at `now`, each only
 * when it applies (T-R8.11, the Session Popover proposal):
 *
 * - Take attendance leads, for a teacher with `teaching.attendance`, once the
 *   session has started and while it is not cancelled.
 * - A cancelled date offers Restore in place of the two actions for one date
 *   (Edit this date, Cancel this date).
 * - A session of a weekly series then offers Edit repeating session and Stop
 *   repeating; a one-off without attendance offers Delete.
 *
 * Every action but attendance changes the class, and needs
 * `teaching.classes.write`.
 */
export function sessionActions(
  session: ClassSession,
  now: number,
  may: Readonly<{ write: boolean; attend: boolean }>,
): SessionAction[] {
  const actions: SessionAction[] = [];
  if (may.attend && !session.cancelled && started(session, now))
    actions.push("attendance");
  if (!may.write) return actions;
  if (session.cancelled) actions.push("restore");
  else actions.push("editDate", "cancel");
  if (session.seriesId !== null) actions.push("editSeries", "stop");
  else if (!session.hasAttendance) actions.push("delete");
  return actions;
}

/** attendanceHref is the register of `session`: its class's Attendance tab (T-R8.12). */
export function attendanceHref(session: ClassSession): string {
  const query = new URLSearchParams({ tab: "attendance", session: session.id });
  return `/teacher/classes/${session.classId}?${query.toString()}`;
}

/**
 * nextOccurrence is the first date, today or later, on which `series` meets:
 * the date Edit repeating session starts from by default. A series that
 * starts later starts there; one that has ended gives its start or today,
 * whichever is later, and the server says why it refuses.
 */
export function nextOccurrence(series: SessionSeries, today: string): string {
  let date = series.startsOn > today ? series.startsOn : today;
  const ahead = (series.weekday - weekdayOf(date) + 7) % 7;
  const next = addDays(date, ahead);
  if (series.endsOn === null || next <= series.endsOn) date = next;
  return date;
}

/** The lengths the deck's forms offer, in minutes, with a session's own when it is another. */
export function lengthOptions(current: number): string[] {
  const deck = [60, 90, 120];
  const all = deck.includes(current) ? deck : [...deck, current].sort((a, b) => a - b);
  return all.map(String);
}

/** EditSessionValues are the fields of one date: the New session form's, and a note. */
export type EditSessionValues = {
  date: string;
  time: string;
  dur: string;
  room: string;
  note: string;
};

/** editSessionDefaults is the session as it reads now, on the wall clock of `zone`. */
export function editSessionDefaults(
  session: ClassSession,
  zone: string,
): EditSessionValues {
  return {
    date: session.date,
    time: formatClock(wallClock(session.startsAt, zone).minutes),
    dur: String(session.durationMinutes),
    room: session.room ?? "",
    note: session.note ?? "",
  };
}

/**
 * sessionPatch is what changed between the form as it opened and as it is
 * sent, and nothing else: an emptied room or note is `null`, which on a date
 * of a weekly series gives the series' room back. No change gives null.
 */
export function sessionPatch(
  before: EditSessionValues,
  after: EditSessionValues,
): SessionPatch | null {
  const patch: SessionPatch = {};
  if (after.date !== before.date) patch.date = after.date;
  if (after.time !== before.time) patch.startTime = after.time;
  if (after.dur !== before.dur) patch.durationMinutes = Number(after.dur);
  if (after.room.trim() !== before.room.trim()) patch.room = blankAsNull(after.room);
  if (after.note.trim() !== before.note.trim()) patch.note = blankAsNull(after.note);
  return Object.keys(patch).length === 0 ? null : patch;
}

/** EditSeriesValues are Edit repeating session's fields: from, weekday, start, length and room. */
export type EditSeriesValues = {
  from: string;
  weekday: string;
  time: string;
  dur: string;
  room: string;
};

/** seriesDefaults is the series as it stands, from its next date on. */
export function seriesDefaults(series: SessionSeries, today: string): EditSeriesValues {
  return {
    from: nextOccurrence(series, today),
    weekday: String(series.weekday),
    time: series.startTime,
    dur: String(series.durationMinutes),
    room: series.room ?? "",
  };
}

/**
 * seriesPatch is `fromDate` with what changed, or null when nothing beside
 * the date did: the contract asks for at least one change.
 */
export function seriesPatch(
  before: EditSeriesValues,
  after: EditSeriesValues,
): SeriesPatch | null {
  const patch: SeriesPatch = { fromDate: after.from };
  if (after.weekday !== before.weekday) patch.weekday = Number(after.weekday);
  if (after.time !== before.time) patch.startTime = after.time;
  if (after.dur !== before.dur) patch.durationMinutes = Number(after.dur);
  if (after.room.trim() !== before.room.trim()) patch.room = blankAsNull(after.room);
  return Object.keys(patch).length === 1 ? null : patch;
}

/**
 * attendedToday reports whether today's date of the series has attendance,
 * as far as the opened session tells: then the server starts a change from
 * today on tomorrow instead.
 */
export function attendedToday(session: ClassSession, today: string): boolean {
  return session.seriesId !== null && session.date === today && session.hasAttendance;
}

/** earliestLastDate is the first last date Stop repeating takes: yesterday. */
export function earliestLastDate(today: string): string {
  return addDays(today, -1);
}
