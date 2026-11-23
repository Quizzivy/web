import type { TFunction } from "i18next";
import type { ClassListItem } from "@/features/classes/api";
import { formatDayMonth } from "@/lib/i18n/schedule";
import { termOn, type CalendarTerm } from "./api";

/** NewSessionValues are the deck's New session form. */
export type NewSessionValues = {
  cls: string;
  date: string;
  time: string;
  dur: string;
  room: string;
  rep: boolean;
};

/** The deck's three lengths, in minutes; 90 is the default. */
export const LENGTHS = ["60", "90", "120"] as const;
/** The deck's default start. */
export const DEFAULT_START = "18:00";
/** A session may be no more than two years out (the contract's `SessionCreate`). */
const YEARS_AHEAD = 2;

/** PICKER_KEY is the class pickers' shared read: the caller's active classes, up to 100. */
export const PICKER_KEY = ["teacher-classes", "picker", { limit: 100 }] as const;

/**
 * newSessionDefaults is the form as it opens: the first class with its own
 * room, today, 18:00, 90 minutes and every week.
 */
export function newSessionDefaults(
  classes: readonly ClassListItem[],
  today: string,
): NewSessionValues {
  const first = classes[0];
  return {
    cls: first?.id ?? "",
    date: today,
    time: DEFAULT_START,
    dur: "90",
    room: first?.ownRoom ?? "",
    rep: true,
  };
}

/**
 * followClass keeps Room on the chosen class's own room until the teacher
 * types another: a change of class carries the room along only when the room
 * still reads the old class's.
 */
export function followClass(
  classes: readonly ClassListItem[],
): (next: NewSessionValues, previous: NewSessionValues) => NewSessionValues {
  const roomOf = (id: string) =>
    classes.find((klass) => klass.id === id)?.ownRoom ?? "";
  return (next, previous) =>
    next.cls !== previous.cls && previous.room === roomOf(previous.cls)
      ? { ...next, room: roomOf(next.cls) }
      : next;
}

/** latestDate is the last day a session may be added on: two years after today. */
function latestDate(today: string): string {
  return `${Number(today.slice(0, 4)) + YEARS_AHEAD}${today.slice(4)}`;
}

/**
 * validateNewSession finds what the server would refuse before asking it: a
 * date more than two years out.
 */
export function validateNewSession(
  values: NewSessionValues,
  today: string,
  t: TFunction,
): Partial<Record<keyof NewSessionValues, string>> | null {
  if (values.date !== "" && values.date > latestDate(today))
    return { date: t("calendar.new.dateTooFar") };
  return null;
}

/**
 * repeatHint says how long "Repeat every week" runs: to the end of the term
 * that holds the date ("Đến hết 19 thg 12"), else until the teacher stops it.
 */
export function repeatHint(
  values: NewSessionValues,
  terms: readonly CalendarTerm[],
  t: TFunction,
  locale: "vi" | "en",
): string | undefined {
  if (!values.rep) return undefined;
  const term = values.date === "" ? undefined : termOn(terms, values.date);
  if (term === undefined) return t("calendar.new.untilStopped");
  return t("calendar.new.untilTerm", {
    date: formatDayMonth(term.endsOn, locale, {
      year: term.endsOn.slice(0, 4) !== values.date.slice(0, 4),
    }),
  });
}
