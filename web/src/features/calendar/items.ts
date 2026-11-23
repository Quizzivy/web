import type { TFunction } from "i18next";
import { formatClock, formatTimeRange } from "@/lib/i18n/schedule";
import type { ClassSession } from "./api";
import type { CalendarItem } from "./week";

/**
 * OpenSession opens a class session's popover beside `anchor`, the event the
 * teacher pressed (T-R8.11 fills it; DG-36 returns focus to `anchor`).
 */
export type OpenSession = (session: ClassSession, anchor: HTMLElement) => void;

/** The legend's three colours, and the cancelled look, per kind: block, ink and bar. */
export const TONES = {
  session: { block: "bg-brand-soft text-brand-ink", bar: "bg-brand" },
  closes: { block: "bg-warning-soft text-warning-ink", bar: "bg-warning" },
  opens: { block: "bg-info-soft text-info-ink", bar: "bg-info" },
  cancelled: { block: "bg-muted text-muted-fg", bar: "bg-border" },
} as const;

/** toneOf is an item's colours: its kind's, or the muted look of a cancelled session. */
export function toneOf(item: CalendarItem) {
  if (item.kind === "session")
    return item.session.cancelled ? TONES.cancelled : TONES.session;
  return TONES[item.kind];
}

/** itemTitle is what an item is called: the class, or "Reading Mock opens". */
export function itemTitle(item: CalendarItem, t: TFunction): string {
  if (item.kind === "session") return item.session.className;
  return t(item.kind === "opens" ? "calendar.event.opens" : "calendar.event.closes", {
    title: item.event.title,
  });
}

/**
 * itemTime is the line under a grid event's title: a session's range, a
 * moment's time, or "Đã huỷ" for a cancelled session.
 */
export function itemTime(item: CalendarItem, t: TFunction): string {
  if (item.kind !== "session") return formatClock(item.span.start);
  if (item.session.cancelled) return t("calendar.event.cancelled");
  return formatTimeRange(item.span.start, item.span.minutes);
}

/** assignmentHref is where an assignment's opening or closing leads; a session leads nowhere. */
export function assignmentHref(item: CalendarItem): string | null {
  return item.kind === "session"
    ? null
    : `/teacher/assignments/${item.event.assignmentId}`;
}

/** AgendaDay is one day of the agenda and what it holds, in time order. */
export type AgendaDay = Readonly<{ date: string; items: readonly CalendarItem[] }>;

/**
 * agendaDays are the days the phone's agenda lists: from today on when the
 * week holds today, else the whole week, and only the days that hold
 * something. A week whose days with anything are all behind today lists them
 * all, so the agenda never reads as empty when the week is not.
 */
export function agendaDays(
  days: readonly string[],
  items: readonly (readonly CalendarItem[])[],
  today: string,
): AgendaDay[] {
  const all = days
    .map((date, index) => ({ date, items: items[index] ?? [] }))
    .filter((day) => day.items.length > 0);
  const ahead = days.includes(today) ? all.filter((day) => day.date >= today) : all;
  return ahead.length > 0 ? ahead : all;
}
