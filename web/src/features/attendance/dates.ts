import { fromZonedTime } from "date-fns-tz";
import { getDisplayTimeZone, sameAppDay } from "@/lib/i18n/datetime";
import type { Locale } from "@/lib/i18n";
import { formatClock, formatDayLabel, wallClock } from "@/lib/i18n/schedule";

// Day and time labels come from the schedule formatter (`@/lib/i18n/schedule`,
// T-R8.10); only what it lacks lives here.

/** GRACE_MS is how early the server takes a register: 15 minutes before the start. */
export const GRACE_MS = 15 * 60 * 1000;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * sessionLabel names a session in its picker, its day and start in the
 * display zone as the schedule writes them: "Th 4, 24 thg 9 · 18:00".
 */
export function sessionLabel(
  startsAt: string,
  locale: Locale,
  zone = getDisplayTimeZone(),
): string {
  const start = wallClock(startsAt, zone);
  return `${formatDayLabel(start.date, locale)} · ${formatClock(start.minutes)}`;
}

/** isToday says `instant` falls on the day of `now` in the display zone. */
export function isToday(instant: string | Date, now: Date): boolean {
  return sameAppDay(instant, now);
}

/** startOfDay is the instant the day of `now` began in the display zone. */
export function startOfDay(now: Date, zone = getDisplayTimeZone()): Date {
  return fromZonedTime(`${wallClock(now, zone).date}T00:00:00`, zone);
}

/** weekBefore is the instant seven days before `instant`. */
export function weekBefore(instant: Date): Date {
  return new Date(instant.getTime() - WEEK_MS);
}

/**
 * notOpenYet says a session's register cannot be taken yet: it starts more
 * than GRACE_MS after `now`, which the save refuses.
 */
export function notOpenYet(startsAt: string, now: Date): boolean {
  return Date.parse(startsAt) - GRACE_MS > now.getTime();
}
