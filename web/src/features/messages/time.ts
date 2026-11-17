import type { TFunction } from "i18next";
import type { Locale } from "@/lib/i18n";
import {
  appDaysUntil,
  dayMonth,
  dayMonthYear,
  formatTime,
  weekdayName,
  weekdayShort,
} from "@/lib/i18n/datetime";

/** daysAgo counts calendar days in the app's zone from `at` to `now`: 0 today, 1 yesterday. */
export function daysAgo(at: string, now: Date): number {
  return -appDaysUntil(at, now);
}

function sameYear(at: string, now: Date): boolean {
  return new Date(at).getUTCFullYear() === now.getUTCFullYear();
}

/**
 * dayLabel is a day pill of the stream (the deck's "Today", "Monday"): today,
 * yesterday, the weekday within the week, and the date before that, with its
 * year when it is not this year's.
 */
export function dayLabel(at: string, now: Date, locale: Locale, t: TFunction): string {
  const ago = daysAgo(at, now);
  if (ago <= 0) return t("messages.day.today");
  if (ago === 1) return t("messages.day.yesterday");
  if (ago < 7) {
    const name = weekdayName(at, locale);
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  }
  return sameYear(at, now) ? dayMonth(at, locale) : dayMonthYear(at, locale);
}

/**
 * rowTime is the time a row of the list shows (the deck's "20:20",
 * "Yesterday", "Mon"): the clock today, then yesterday, the short weekday
 * within the week, and the date.
 */
export function rowTime(at: string, now: Date, locale: Locale, t: TFunction): string {
  const ago = daysAgo(at, now);
  if (ago <= 0) return formatTime(at, locale);
  if (ago === 1) return t("messages.day.yesterday");
  if (ago < 7) return weekdayShort(at, locale);
  return sameYear(at, now) ? dayMonth(at, locale) : dayMonthYear(at, locale);
}

/** clock is the time under a bubble or on a card, "20:16": the day is on the pill above. */
export function clock(at: string, locale: Locale): string {
  return formatTime(at, locale);
}
