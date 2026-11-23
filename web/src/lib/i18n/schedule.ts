import { formatInTimeZone } from "date-fns-tz";
import type { Locale } from "./index";

/**
 * The schedule's words, in both languages (T-R8.10). Every surface that shows
 * a session, a weekly slot, a week or a time formats it here: the Calendar,
 * the class surfaces and the join preview (T-R8.14), and the student's This
 * week (T-R8.15). It holds no translation keys, so any surface may import it
 * without loading another's strings: the words are the calendar's own, as
 * `Intl` would give them, written out so both languages read as the deck
 * writes them ("T2 · T4 · T6, 18:00", "22 – 28 tháng 9").
 *
 * A `LocalDate` is `YYYY-MM-DD` with no zone, as the contract sends it; an
 * `IsoWeekday` is Monday 1 to Sunday 7; a clock time is `HH:MM` or minutes
 * after midnight.
 */

/** IsoWeekday is ISO 8601's numbering, Monday 1 to Sunday 7. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** ScheduleSlot is one weekly meeting time, the contract's `ScheduleSlot`. */
export type ScheduleSlot = Readonly<{
  weekday: number;
  startTime: string;
  durationMinutes?: number;
}>;

const ABBR: Record<Locale, readonly string[]> = {
  vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

const COLUMN: Record<Locale, readonly string[]> = {
  vi: ["Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7", "CN"],
  en: ABBR.en,
};

const SENTENCE: Record<Locale, readonly string[]> = {
  vi: ["thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy", "Chủ nhật"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

const MONTH_LONG_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT_EN = MONTH_LONG_EN.map((month) => month.slice(0, 3));

function slot(weekday: number): number {
  return Math.min(7, Math.max(1, Math.trunc(weekday))) - 1;
}

/** weekdayAbbr is a weekday in a schedule line: "T2", "CN"; "Mon", "Sun". */
export function weekdayAbbr(weekday: number, locale: Locale): string {
  return ABBR[locale][slot(weekday)]!;
}

/** weekdayColumn is a weekday over a day's column or row: "Th 2", "CN"; "Mon". */
export function weekdayColumn(weekday: number, locale: Locale): string {
  return COLUMN[locale][slot(weekday)]!;
}

/** weekdayInSentence is a weekday inside a sentence: "thứ Hai", "Chủ nhật"; "Monday". */
export function weekdayInSentence(weekday: number, locale: Locale): string {
  return SENTENCE[locale][slot(weekday)]!;
}

/** parts reads a string's year, month (1 to 12) and day. */
function parts(date: string): readonly [number, number, number] {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return [year, month, day];
}

/** weekdayOf is the ISO weekday a string falls on. */
export function weekdayOf(date: string): IsoWeekday {
  const [year, month, day] = parts(date);
  const sunday0 = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sunday0 === 0 ? 7 : sunday0) as IsoWeekday;
}

function monthLong(month: number, locale: Locale): string {
  return locale === "vi" ? `tháng ${month}` : MONTH_LONG_EN[month - 1]!;
}

function monthShort(month: number, locale: Locale): string {
  return locale === "vi" ? `thg ${month}` : MONTH_SHORT_EN[month - 1]!;
}

function withYear(text: string, year: number, locale: Locale): string {
  return locale === "vi" ? `${text} năm ${year}` : `${text} ${year}`;
}

/**
 * formatDateRange names the days from `first` to `last`, both included, as a
 * heading does: "22 – 28 tháng 9" and "22 – 28 September" within a month,
 * "29 tháng 9 – 5 tháng 10" across two, and with both years across two years
 * ("29 tháng 12 năm 2026 – 4 tháng 1 năm 2027"). One day is named alone.
 */
export function formatDateRange(first: string, last: string, locale: Locale): string {
  const [y1, m1, d1] = parts(first);
  const [y2, m2, d2] = parts(last);
  if (first === last) return `${d1} ${monthLong(m1, locale)}`;
  if (y1 !== y2) {
    const start = withYear(`${d1} ${monthLong(m1, locale)}`, y1, locale);
    const end = withYear(`${d2} ${monthLong(m2, locale)}`, y2, locale);
    return `${start} – ${end}`;
  }
  if (m1 !== m2)
    return `${d1} ${monthLong(m1, locale)} – ${d2} ${monthLong(m2, locale)}`;
  return `${d1} – ${d2} ${monthLong(m2, locale)}`;
}

/**
 * formatDayMonth is a date in a sentence or a toast: "26 thg 9", "26 Sep",
 * with its year when `year` is set ("26 thg 9 năm 2027", "26 Sep 2027").
 */
export function formatDayMonth(
  date: string,
  locale: Locale,
  options: Readonly<{ year?: boolean }> = {},
): string {
  const [year, month, day] = parts(date);
  const text = `${day} ${monthShort(month, locale)}`;
  return options.year ? withYear(text, year, locale) : text;
}

/** formatDayLabel heads a day of the agenda: "Th 4, 24 thg 9", "Wed 24 Sep". */
export function formatDayLabel(date: string, locale: Locale): string {
  const weekday = weekdayColumn(weekdayOf(date), locale);
  const day = formatDayMonth(date, locale);
  return locale === "vi" ? `${weekday}, ${day}` : `${weekday} ${day}`;
}

/** minutesOf reads `HH:MM` as minutes after midnight; anything else is 0. */
export function minutesOf(time: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/**
 * formatClock is a time on the 24-hour clock, "08:00", from minutes after
 * midnight; a time past midnight wraps ("00:30" for 1470).
 */
export function formatClock(minutes: number): string {
  const whole = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = String(Math.floor(whole / 60)).padStart(2, "0");
  return `${hours}:${String(whole % 60).padStart(2, "0")}`;
}

/** formatTimeRange is a session's time: "18:00 – 19:30". */
export function formatTimeRange(startMinutes: number, durationMinutes: number): string {
  return `${formatClock(startMinutes)} – ${formatClock(startMinutes + durationMinutes)}`;
}

/**
 * formatSlots is a class's weekly schedule (the contract's `ClassSchedule.slots`):
 * the days that meet at one time, then the time, "T2 · T4 · T6, 18:00" and
 * "Mon · Wed · Fri, 18:00"; several times are joined by "; ", each led by its
 * earliest day ("T2 · T4, 18:00; T7, 09:00"). No slot gives "", so the caller
 * shows its fallback (the free-text label, or "No schedule yet").
 */
export function formatSlots(slots: readonly ScheduleSlot[], locale: Locale): string {
  const byTime = new Map<string, Set<number>>();
  for (const { weekday, startTime } of slots) {
    const time = formatClock(minutesOf(startTime));
    const days = byTime.get(time) ?? new Set<number>();
    days.add(slot(weekday) + 1);
    byTime.set(time, days);
  }
  return [...byTime.entries()]
    .map(([time, days]) => ({ time, days: [...days].sort((a, b) => a - b) }))
    .sort((a, b) => a.days[0]! - b.days[0]! || a.time.localeCompare(b.time))
    .map(
      ({ time, days }) =>
        `${days.map((day) => weekdayAbbr(day, locale)).join(" · ")}, ${time}`,
    )
    .join("; ");
}

/** WallClock is where an instant falls in a zone: its string and minutes after midnight. */
export type WallClock = Readonly<{ date: string; minutes: number }>;

/** wallClock reads an instant (`startsAt`, `at`) on the wall clock of `zone`. */
export function wallClock(instant: string | Date, zone: string): WallClock {
  const [date = "1970-01-01", time = "00:00"] = formatInTimeZone(
    instant,
    zone,
    "yyyy-MM-dd HH:mm",
  ).split(" ");
  return { date, minutes: minutesOf(time) };
}

/**
 * ClassScheduleLike is the contract's `ClassSchedule`: the weekly slots the
 * class's repeating sessions give it, and the free-text label its teacher
 * typed (R4's `scheduleLabel`), `null` for none.
 */
export type ClassScheduleLike = Readonly<{
  slots: readonly ScheduleSlot[];
  label: string | null;
}>;

const NO_SCHEDULE: Record<Locale, string> = {
  vi: "Chưa có lịch học",
  en: "No schedule yet",
};

/**
 * formatSchedule is a class's schedule without its room: the slots as
 * `formatSlots` writes them, else the label, else "" (as for `null`, a join
 * preview whose class has neither).
 */
export function formatSchedule(
  schedule: ClassScheduleLike | null | undefined,
  locale: Locale,
): string {
  if (!schedule) return "";
  const slots = formatSlots(schedule.slots, locale);
  if (slots !== "") return slots;
  return schedule.label?.trim() ?? "";
}

/**
 * formatScheduleLine is the line every class surface shows under a class's
 * name (T-R8.14): the schedule, then the room after " · " ("T2 · T4 · T6,
 * 18:00 · Phòng 2"). A class with neither slots nor a label reads "Chưa có
 * lịch học" ("No schedule yet"), its room still following; with `fallback`
 * false, as on the public join preview, it reads only its room, or "".
 */
export function formatScheduleLine(
  schedule: ClassScheduleLike | null | undefined,
  room: string | null | undefined,
  locale: Locale,
  options: Readonly<{ fallback?: boolean }> = {},
): string {
  const { fallback = true } = options;
  const when =
    formatSchedule(schedule, locale) || (fallback ? NO_SCHEDULE[locale] : "");
  return [when, room?.trim() ?? ""].filter((part) => part !== "").join(" · ");
}

/**
 * nextSlotDate is the date of a class's next weekly meeting, from `today` at
 * `minutes` after midnight on the same wall clock: today's own slot counts
 * until it has ended. No slot gives null.
 */
export function nextSlotDate(
  slots: readonly ScheduleSlot[],
  today: string,
  minutes: number,
): string | null {
  const weekday = weekdayOf(today);
  let soonest: number | null = null;
  for (const { weekday: day, startTime, durationMinutes = 0 } of slots) {
    let ahead = (slot(day) + 1 - weekday + 7) % 7;
    if (ahead === 0 && minutesOf(startTime) + durationMinutes <= minutes) ahead = 7;
    if (soonest === null || ahead < soonest) soonest = ahead;
  }
  if (soonest === null) return null;
  const [year, month, day] = parts(today);
  return new Date(Date.UTC(year, month - 1, day + soonest)).toISOString().slice(0, 10);
}
