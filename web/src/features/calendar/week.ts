import { wallClock, weekdayOf } from "@/lib/i18n/schedule";
import type { Calendar, CalendarAssignmentEvent, ClassSession } from "./api";

/**
 * The calendar's weeks and the week grid's geometry (T-R8.10). Weeks start on
 * Monday and are named as ISO 8601 names them, `2026-W39`, which is how the
 * address carries one (`?week=`). Dates are LocalDates, `YYYY-MM-DD`, counted
 * on the UTC calendar so no zone or daylight change moves a day.
 */

const ISO_WEEK = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 86_400_000;

function utc(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function local(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** addDays moves a string by `days`, either way. */
export function addDays(date: string, days: number): string {
  return local(utc(date) + days * DAY_MS);
}

/** daysBetween counts the days from `from` to `to`: 0 on the same day, negative before. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** mondayOf is the Monday of the week `date` falls in. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - weekdayOf(date));
}

/** isoWeekOf names the ISO week `date` falls in: its year is its Thursday's. */
export function isoWeekOf(date: string): string {
  const thursday = addDays(mondayOf(date), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * mondayOfIsoWeek is the Monday an ISO week name starts on, or null for a
 * name that is malformed or names a week its year does not have (`W53` of a
 * 52-week year).
 */
export function mondayOfIsoWeek(name: string | null | undefined): string | null {
  const match = ISO_WEEK.exec(name ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const monday = addDays(mondayOf(`${year}-01-04`), (week - 1) * 7);
  return isoWeekOf(monday) === name ? monday : null;
}

/** weekDays are the seven LocalDates of the week starting on `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

// --- the grid ------------------------------------------------------------

/** HOUR_PX is the height of one hour row, as the deck draws it. */
export const HOUR_PX = 44;
/** MIN_EVENT_PX is the least height of an event, so its title and time both show. */
export const MIN_EVENT_PX = 36;
/** The hours the grid always shows: 08:00 to 22:00. */
export const FIRST_HOUR = 8;
export const LAST_HOUR = 22;
/** An assignment's opening or closing is a moment, drawn as the deck draws it: 45 minutes. */
export const MOMENT_MINUTES = 45;

/** Span is what an event takes on its day: minutes after midnight, and how long. */
export type Span = Readonly<{ start: number; minutes: number }>;

/** The minutes an event's block reaches down to, its least height included. */
function reach({ start, minutes }: Span): number {
  return start + Math.max(minutes, ((MIN_EVENT_PX + 2) * 60) / HOUR_PX);
}

/**
 * hourRange is the grid's first and last hour for a week's events: 08:00 to
 * 22:00, grown to whole hours to take in any event that starts earlier or
 * whose block reaches later, never past midnight.
 */
export function hourRange(
  spans: readonly Span[],
): Readonly<{ first: number; last: number }> {
  let first = FIRST_HOUR;
  let last = LAST_HOUR;
  for (const span of spans) {
    first = Math.min(first, Math.floor(span.start / 60));
    last = Math.max(last, Math.ceil(reach(span) / 60));
  }
  return { first: Math.max(0, first), last: Math.min(24, last) };
}

/**
 * openingHour is the hour the grid opens on, at the top of its card: the
 * deck's 08:00, or the hour of the week's first session when one starts
 * earlier. A test that opens or closes before then grows the grid upward
 * without moving that window, so the week's sessions stay in view and the
 * earlier hours are a scroll up.
 */
export function openingHour(
  sessions: readonly Span[],
  range: Readonly<{ first: number; last: number }>,
): number {
  let hour = FIRST_HOUR;
  for (const span of sessions) hour = Math.min(hour, Math.floor(span.start / 60));
  return Math.max(range.first, hour);
}

/** Box is an event's place in its day column, in pixels from the first hour's line. */
export type Box = Readonly<{ top: number; height: number }>;

/**
 * eventBox places an event as the deck does: 1px under its start, 3px short
 * of its end, and never less than MIN_EVENT_PX high.
 */
export function eventBox(span: Span, firstHour: number): Box {
  return {
    top: ((span.start - firstHour * 60) * HOUR_PX) / 60 + 1,
    height: Math.max(MIN_EVENT_PX, (span.minutes * HOUR_PX) / 60 - 3),
  };
}

/** nowTop is where the now-line crosses today's column, or null outside the grid's hours. */
export function nowTop(
  minutes: number,
  range: Readonly<{ first: number; last: number }>,
) {
  if (minutes < range.first * 60 || minutes > range.last * 60) return null;
  return ((minutes - range.first * 60) * HOUR_PX) / 60;
}

/** Lane is an event's share of its column's width: lane `index` of `count`. */
export type Lane = Readonly<{ index: number; count: number }>;

/**
 * lanes shares a day's width among events whose blocks overlap, so neither
 * hides the other: each run of overlapping events splits the column into as
 * many lanes as it needs at once, and an event takes the first lane free at
 * its start. `spans` are in the order they are drawn; the answer is too.
 */
export function lanes(spans: readonly Span[]): Lane[] {
  const order = spans
    .map((span, index) => ({ span, index }))
    .sort((a, b) => a.span.start - b.span.start || b.span.minutes - a.span.minutes);
  const result: Lane[] = spans.map(() => ({ index: 0, count: 1 }));
  let run: { index: number; lane: number }[] = [];
  let ends: number[] = [];
  let runEnd = -1;
  const close = () => {
    const count = ends.length;
    for (const member of run) result[member.index] = { index: member.lane, count };
    run = [];
    ends = [];
  };
  for (const { span, index } of order) {
    if (span.start >= runEnd) close();
    let lane = ends.findIndex((end) => end <= span.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = reach(span);
    run.push({ index, lane });
    runEnd = Math.max(span.start >= runEnd ? 0 : runEnd, reach(span));
  }
  close();
  return result;
}

// --- the week's items ----------------------------------------------------

/**
 * CalendarItem is one thing drawn on a day: a class session, or an
 * assignment's opening or closing. `span` is where it falls on the wall clock
 * of the zone the week is read in.
 */
export type CalendarItem =
  | Readonly<{ kind: "session"; key: string; span: Span; session: ClassSession }>
  | Readonly<{
      kind: "opens" | "closes";
      key: string;
      span: Span;
      event: CalendarAssignmentEvent;
    }>;

/**
 * itemsByDay sorts a week's calendar into its seven days, each in time order
 * (a session before a moment at the same minute), reading every instant on
 * the wall clock of `zone`. Anything that falls outside the week is left out.
 */
export function itemsByDay(
  calendar: Calendar,
  days: readonly string[],
  zone: string,
): CalendarItem[][] {
  const byDay = days.map((): CalendarItem[] => []);
  const place = (date: string, item: CalendarItem) => {
    const index = days.indexOf(date);
    if (index >= 0) byDay[index]!.push(item);
  };
  for (const session of calendar.sessions) {
    const at = wallClock(session.startsAt, zone);
    place(at.date, {
      kind: "session",
      key: `session-${session.id}`,
      span: { start: at.minutes, minutes: session.durationMinutes },
      session,
    });
  }
  for (const event of calendar.assignmentEvents) {
    const at = wallClock(event.at, zone);
    place(at.date, {
      kind: event.kind,
      key: `${event.kind}-${event.assignmentId}-${event.at}`,
      span: { start: at.minutes, minutes: MOMENT_MINUTES },
      event,
    });
  }
  const rank = (item: CalendarItem) => (item.kind === "session" ? 0 : 1);
  for (const items of byDay)
    items.sort((a, b) => a.span.start - b.span.start || rank(a) - rank(b));
  return byDay;
}
