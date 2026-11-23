import type { TFunction } from "i18next";
import { CalendarDays, Repeat } from "lucide-react";
import type { FormField } from "@/components/shared/form/FormDialog";
import { isoWeekOf } from "@/features/calendar/week";
import { ApiError, fieldMessages } from "@/lib/api/errors";
import type { Locale } from "@/lib/i18n";
import {
  formatSchedule,
  nextSlotDate,
  wallClock,
  type ClassScheduleLike,
} from "@/lib/i18n/schedule";

/** ClassFieldValues are the words a teacher gives a class in the deck's dialogs. */
export type ClassFieldValues = {
  name: string;
  schedule: string;
  room: string;
};

/**
 * DerivedSchedule is a class's schedule once it has repeating sessions: the
 * line its slots give, and the calendar's week of its next session, where
 * the sessions are changed.
 */
export type DerivedSchedule = Readonly<{ line: string; calendar: string }>;

/**
 * derivedSchedule is the schedule Edit class shows read-only (T-R8.14), or
 * null for a class without slots, whose schedule stays R4's free text. The
 * calendar opens at the ISO week of the next session, read on the wall clock
 * of `zone` at `now`.
 */
export function derivedSchedule(
  schedule: ClassScheduleLike | undefined,
  locale: Locale,
  zone: string,
  now: Date,
): DerivedSchedule | null {
  if (!schedule || schedule.slots.length === 0) return null;
  const at = wallClock(now, zone);
  const next = nextSlotDate(schedule.slots, at.date, at.minutes) ?? at.date;
  return {
    line: formatSchedule(schedule, locale),
    calendar: `/teacher/calendar?week=${isoWeekOf(next)}`,
  };
}

/**
 * classFields are the New class and Edit class fields: name, schedule and
 * room. With a `derived` schedule the Schedule field reads it, with "Đổi
 * trong Lịch" beside it and where it comes from under it, and the Room field
 * says what it is for once sessions exist.
 */
export function classFields(
  t: TFunction,
  derived: DerivedSchedule | null = null,
): readonly FormField<ClassFieldValues>[] {
  return [
    {
      kind: "text",
      name: "name",
      label: t("classes.name"),
      placeholder: t("classes.namePlaceholder"),
      required: true,
      maxLength: 120,
    },
    derived
      ? {
          kind: "derived",
          name: "schedule",
          label: t("classes.schedule"),
          icon: Repeat,
          value: derived.line,
          action: {
            label: t("classes.changeInCalendar"),
            icon: CalendarDays,
            to: derived.calendar,
          },
          hint: t("classes.fromSessions"),
        }
      : {
          kind: "text",
          name: "schedule",
          label: t("classes.schedule"),
          placeholder: t("classes.schedulePlaceholder"),
          maxLength: 120,
        },
    {
      kind: "text",
      name: "room",
      label: t("classes.room"),
      placeholder: t("classes.roomPlaceholder"),
      maxLength: 60,
      ...(derived ? { hint: t("classes.roomForNewSessions") } : {}),
    },
  ];
}

/**
 * saveError is what a class dialog says when its save fails: the first field
 * the server named, else the server's message, else `fallback`.
 */
export function saveError(cause: unknown, fallback: string): string {
  const field = fieldMessages(cause)[0];
  if (field !== undefined) return field;
  return cause instanceof ApiError ? cause.message : fallback;
}

/** blankAsNull trims a field and sends a blank one as none. */
export function blankAsNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
