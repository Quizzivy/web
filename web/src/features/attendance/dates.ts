import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { enUS, vi } from "date-fns/locale";
import { getDisplayTimeZone, sameAppDay } from "@/lib/i18n/datetime";
import type { Locale } from "@/lib/i18n";

// These labels stay with Attendance until R8's schedule formatter
// (`@/lib/i18n/schedule`, T-R8.10) is on the branch; `dayLabel` is its
// `formatDayLabel` read from an instant, and moves there then.

/** GRACE_MS is how early the server takes a register: 15 minutes before the start. */
export const GRACE_MS = 15 * 60 * 1000;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * dayLabel names the day of `instant` as a session's row and picker do:
 * "Th 4, 24 thg 9" in Vietnamese and "Wed 24 Sep" in English.
 */
export function dayLabel(
  instant: string | Date,
  locale: Locale,
  zone = getDisplayTimeZone(),
): string {
  return locale === "vi"
    ? formatInTimeZone(instant, zone, "EEEEEE, d 'thg' M", { locale: vi })
    : formatInTimeZone(instant, zone, "EEE d MMM", { locale: enUS });
}

/** clock is a session's start on the 24-hour clock: "18:00". */
export function clock(instant: string | Date, zone = getDisplayTimeZone()): string {
  return formatInTimeZone(instant, zone, "HH:mm");
}

/** sessionLabel names a session in its picker: "Th 4, 24 thg 9 · 18:00". */
export function sessionLabel(startsAt: string, locale: Locale): string {
  return `${dayLabel(startsAt, locale)} · ${clock(startsAt)}`;
}

/** isToday says `instant` falls on the day of `now` in the display zone. */
export function isToday(instant: string | Date, now: Date): boolean {
  return sameAppDay(instant, now);
}

/** startOfDay is the instant the day of `now` began in the display zone. */
export function startOfDay(now: Date, zone = getDisplayTimeZone()): Date {
  return fromZonedTime(`${formatInTimeZone(now, zone, "yyyy-MM-dd")}T00:00:00`, zone);
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
