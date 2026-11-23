import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type StudentWeek = components["schemas"]["StudentWeek"];
export type StudentWeekDay = components["schemas"]["StudentWeekDay"];
export type WeekItem = components["schemas"]["WeekItem"];
export type WeekSessionItem = components["schemas"]["WeekSessionItem"];
export type WeekDueItem = components["schemas"]["WeekDueItem"];

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * weekStartParam reads the address's `?start=`, any day of the week wanted
 * (T-R8.15: links may name a week, the page draws no way to another). A value
 * that is not a real `YYYY-MM-DD` is ignored, so the page shows this week
 * rather than the server's 400.
 */
export function weekStartParam(value: string | null): string | null {
  const match = value === null ? null : LOCAL_DATE.exec(value);
  if (match === null) return null;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

/** getStudentWeek reads the week holding `start`, or this week without one. */
export function getStudentWeek(start: string | null, signal?: AbortSignal) {
  const query = start === null ? {} : { start };
  return api("get", "/app/week", signal ? { query, signal } : { query });
}

/**
 * studentWeekQuery is one week's read. Nothing polls it: it is read again when
 * the window regains focus, as the teacher's Calendar is.
 */
export function studentWeekQuery(start: string | null) {
  return queryOptions({
    queryKey: ["student-week", start ?? "current"],
    queryFn: ({ signal }) => getStudentWeek(start, signal),
    refetchOnWindowFocus: true,
  });
}

/** itemKey tells a day's items apart: a class meets once at a time, a test closes once. */
export function itemKey(item: WeekItem): string {
  return item.kind === "session"
    ? `session:${item.classId}:${item.startsAt}`
    : `due:${item.assignmentId}`;
}
