import type { TFunction } from "i18next";
import { formatInTimeZone } from "date-fns-tz";
import type { IntegrityEvent } from "@/features/attempts/api";

/** The G-05 filter chips. */
export type TimelineFilter = "all" | "away" | "audio" | "network";

const AWAY_OPENERS = new Set(["tab_hidden", "window_blur", "fullscreen_exit"]);
const AWAY_CLOSERS = new Set(["tab_visible", "window_focus", "fullscreen_enter"]);
const AUDIO = new Set(["audio_play", "audio_ended", "audio_blocked", "audio_seek"]);
const NETWORK = new Set(["network_offline", "network_online"]);
const CLOSERS = new Set([...AWAY_CLOSERS, "network_online", "audio_ended"]);
const SERVER_START = "start";
/** A break taken by the paper's ✕ (F1), and the kinds that end it. */
const BREAK = "paper_left";
const BREAK_ENDS = new Set(["resume", "session_takeover"]);
const HOUR_MS = 3_600_000;

/** Whether the attempt recorded anything beyond the server's own start, which the table's "Started" row stands for. */
export function hasRecordedEvents(events: readonly IntegrityEvent[]): boolean {
  return events.some((event) => event.kind !== SERVER_START);
}

/** Which chip an event belongs under; `null` for kinds no chip narrows to. */
export function family(kind: string): Exclude<TimelineFilter, "all"> | null {
  if (AWAY_OPENERS.has(kind) || AWAY_CLOSERS.has(kind)) return "away";
  if (AUDIO.has(kind)) return "audio";
  if (NETWORK.has(kind)) return "network";
  return null;
}

/** One row of the Diễn biến table. */
export interface TimelineRow {
  event: IntegrityEvent;
  /** No return yet: the student is still away or still offline. */
  ongoing: boolean;
  /** playNo numbers an audio play within its question or shared recording. */
  playNo: number | null;
  /**
   * breakMs is how long a break (`paper_left`) lasted, to the next resume;
   * null for every other kind, and for a break nothing has resumed yet.
   */
  breakMs: number | null;
}

/**
 * The rows the table draws. The server paired every episode onto its opening
 * event, so a closing event carries nothing the row above does not; and a
 * second leave inside an open episode (blur then hidden) is the same absence
 * twice. Both are dropped. An opener with no duration is kept only when nothing
 * later closed its family -- the "đang tiếp diễn" row (G-05b). An audio play
 * with no recorded end is kept and is not ongoing, because most plays never
 * record one. The server's own start is dropped too: the table draws a
 * "Started" row from `startedAt`.
 */
export function timelineRows(
  events: IntegrityEvent[],
  filter: TimelineFilter,
): TimelineRow[] {
  const plays = new Map<string, number>();
  const rows: TimelineRow[] = [];
  events.forEach((event, index) => {
    if (CLOSERS.has(event.kind) || event.kind === SERVER_START) return;
    let playNo: number | null = null;
    if (event.kind === "audio_play") {
      const key = audioSubject(event);
      playNo = (plays.get(key) ?? 0) + 1;
      plays.set(key, playNo);
    }
    const opener = AWAY_OPENERS.has(event.kind) || event.kind === "network_offline";
    const ongoing = opener && event.durationMs == null && !closedLater(events, index);
    if (opener && event.durationMs == null && !ongoing) return;
    if (filter !== "all" && family(event.kind) !== filter) return;
    const breakMs = event.kind === BREAK ? breakLength(events, index) : null;
    rows.push({ event, ongoing, playNo, breakMs });
  });
  return rows;
}

/** breakLength runs a break to the first resume after it; null when none followed. */
function breakLength(events: IntegrityEvent[], index: number): number | null {
  const left = events[index];
  if (left === undefined) return null;
  const resumed = events.slice(index + 1).find((later) => BREAK_ENDS.has(later.kind));
  if (resumed === undefined) return null;
  return Math.max(
    0,
    new Date(resumed.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
}

function audioSubject(event: IntegrityEvent): string {
  if (event.questionId !== undefined && event.questionId !== null)
    return event.questionId;
  const recordingId = event.meta?.recordingId;
  return typeof recordingId === "string" ? recordingId : "";
}

function closedLater(events: IntegrityEvent[], index: number): boolean {
  const opener = events[index];
  if (opener === undefined) return false;
  const fam = family(opener.kind);
  for (let i = index + 1; i < events.length; i++) {
    const later = events[i];
    if (later === undefined) continue;
    if (!CLOSERS.has(later.kind)) continue;
    if (fam === "audio" && later.questionId !== opener.questionId) continue;
    if (family(later.kind) === fam) return true;
  }
  return false;
}

/** The trailing episode the strip must say it is not summing (G-05b). */
export function hasOpenEpisode(events: IntegrityEvent[]): boolean {
  return timelineRows(events, "away").some((row) => row.ongoing);
}

/**
 * dayClockSpan is the review table's shape for a span that can pass a day (F1):
 * under 24 hours `clockSpan` as before, past it the whole days apart and the
 * rest as "01:29:30", which the caller words as "1 ngày 01:29:30".
 */
export function dayClockSpan(ms: number): { days: number; clock: string } {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86_400);
  if (days === 0) return { days, clock: clockSpan(ms) };
  const rest = total % 86_400;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    days,
    clock: `${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`,
  };
}

/** minutesLabel is a time in whole minutes as the roster and the sheet write it: "—" when unknown. */
export function minutesLabel(minutes: number | null, t: TFunction): string {
  if (minutes === null) return "—";
  return minutes < 1
    ? t("papers.tookUnderMinute")
    : t("papers.tookMinutes", { count: minutes });
}

/**
 * longSpan words a span the teacher reads in minutes, hours or days (F1): the
 * whole minutes under an hour ("52 phút", "dưới 1 phút"), the whole hours
 * under a day ("3 giờ"), and past it days and hours ("2 ngày 1 giờ").
 */
export function longSpan(ms: number, t: TFunction): string {
  const minutes = Math.round(Math.max(0, ms) / 60_000);
  if (minutes < 60) return minutesLabel(minutes, t);
  const hours = Math.round(ms / HOUR_MS);
  if (hours < 24) return t("assignments.detail.left.hours", { hours });
  return t("assignments.detail.left.daysHours", {
    days: Math.floor(hours / 24),
    hours: hours % 24,
  });
}

/**
 * datedRows says which of the moments a list shows carry their day (F1): once
 * the attempt's own moments (`all`) fall on more than one day in the zone, the
 * first shown moment of each day does; otherwise none does.
 */
export function datedRows(
  shown: readonly string[],
  all: readonly string[],
  zone: string,
): boolean[] {
  const dayOf = (moment: string) => formatInTimeZone(moment, zone, "yyyy-MM-dd");
  if (new Set(all.map(dayOf)).size < 2) return shown.map(() => false);
  let last: string | null = null;
  return shown.map((moment) => {
    const day = dayOf(moment);
    const first = day !== last;
    last = day;
    return first;
  });
}

/** "2:41" from milliseconds, the strip's and the table's shape. */
export function clockSpan(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
