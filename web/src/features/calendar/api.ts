import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Calendar = components["schemas"]["Calendar"];
export type ClassSession = components["schemas"]["ClassSession"];
export type CalendarAssignmentEvent = components["schemas"]["CalendarAssignmentEvent"];
export type CalendarTerm = components["schemas"]["CalendarTerm"];
export type SessionCreate = components["schemas"]["SessionCreate"];
export type SessionPatch = components["schemas"]["SessionPatch"];
export type SeriesPatch = components["schemas"]["SeriesPatch"];
export type SessionSeries = components["schemas"]["SessionSeries"];

/**
 * CALENDAR_KEY heads every calendar read, so a change to a session (here, or
 * T-R8.11's popover) makes every week stale at once.
 */
export const CALENDAR_KEY = ["teacher-calendar"] as const;

/** getCalendar reads the caller's sessions and assignment events from `from` up to `to`, which it leaves out. */
export function getCalendar(from: string, to: string, signal?: AbortSignal) {
  const query = { from, to };
  return api("get", "/teacher/calendar", signal ? { query, signal } : { query });
}

/**
 * calendarQuery is one week's read. Nothing polls it: it is read again when
 * the window regains focus and after a change, and a week read in the last
 * 30 seconds is not read again on its way back.
 */
export function calendarQuery(from: string, to: string) {
  return queryOptions({
    queryKey: [...CALENDAR_KEY, from, to],
    queryFn: ({ signal }) => getCalendar(from, to, signal),
    refetchOnWindowFocus: true,
  });
}

/** createClassSession adds a one-off session to a class, or a weekly series with `repeatWeekly`. */
export function createClassSession(classId: string, body: SessionCreate) {
  return api("post", "/teacher/classes/{id}/sessions", {
    path: { id: classId },
    body,
  });
}

/** termOn is the term holding `date`, both ends included, or undefined for none. */
export function termOn(
  terms: readonly CalendarTerm[],
  date: string,
): CalendarTerm | undefined {
  return terms.find((term) => term.startsOn <= date && date <= term.endsOn);
}

/**
 * updateClassSession changes one session, or one date of a weekly series:
 * its date, time, length, room or note, or cancels and restores it.
 */
export function updateClassSession(sessionId: string, body: SessionPatch) {
  return api("patch", "/teacher/sessions/{sessionId}", {
    path: { sessionId },
    body,
  });
}

/** deleteClassSession removes a one-off session that has no attendance. */
export function deleteClassSession(sessionId: string) {
  return api("delete", "/teacher/sessions/{sessionId}", { path: { sessionId } });
}

/** updateSessionSeries changes a weekly session from `fromDate` on; dates before it keep. */
export function updateSessionSeries(seriesId: string, body: SeriesPatch) {
  return api("patch", "/teacher/session-series/{seriesId}", {
    path: { seriesId },
    body,
  });
}

/**
 * endSessionSeries sets a weekly session's last date. It answers the series,
 * or nothing when the series was removed because `lastDate` is before it
 * started.
 */
export function endSessionSeries(seriesId: string, lastDate: string) {
  return api("post", "/teacher/session-series/{seriesId}/end", {
    path: { seriesId },
    body: { lastDate },
  });
}
