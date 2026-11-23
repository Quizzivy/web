import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Repeat } from "lucide-react";
import { DerivedField } from "@/components/shared/form/fields/DerivedField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateClass, type Class } from "@/features/classes/api";
import {
  blankAsNull,
  derivedSchedule,
  saveError,
} from "@/features/classes/classFields";
import { invalidateClass } from "@/features/classes/invalidate";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";

type Words = { name: string; description: string; schedule: string; room: string };

function wordsOf(klass: Class): Words {
  return {
    name: klass.name,
    description: klass.description ?? "",
    schedule: klass.scheduleLabel ?? "",
    room: klass.ownRoom ?? "",
  };
}

function same(a: Words, b: Words): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.description === b.description &&
    a.schedule.trim() === b.schedule.trim() &&
    a.room.trim() === b.room.trim()
  );
}

/**
 * ClassSettingsCard is the class's own words, as the deck's "Class" card
 * draws them, with the schedule and room T-R4.18 added: Name, Description,
 * Schedule and Room, and Save, active while something changed and the name
 * is not blank. A save says "Saved. Students see the new name." Without
 * `canWrite` the fields only read. The room is the class's own (`ownRoom`),
 * never the derived one. Once the class has repeating sessions its Schedule
 * is read from them, read-only, with "Đổi trong Lịch" opening the calendar at
 * its next session, and Room says it is for new sessions (T-R8.14).
 */
export function ClassSettingsCard({
  klass,
  canWrite,
}: Readonly<{ klass: Class; canWrite: boolean }>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const prefix = useId();
  const locale = useLocale();
  const zone = useDisplayTimeZone();
  const derived = useMemo(
    () => derivedSchedule(klass.schedule, locale, zone, new Date()),
    [klass.schedule, locale, zone],
  );
  const [words, setWords] = useState<Words>(() => wordsOf(klass));
  const [saved, setSaved] = useState(false);
  const stored = wordsOf(klass);
  const dirty = !same(words, stored);
  const ready = canWrite && dirty && words.name.trim() !== "";

  const save = useMutation({
    mutationFn: (next: Words) =>
      updateClass(klass.id, {
        name: next.name.trim(),
        description: next.description,
        ...(derived ? {} : { scheduleLabel: blankAsNull(next.schedule) }),
        room: blankAsNull(next.room),
      }),
    onSuccess: async () => {
      setSaved(true);
      await invalidateClass(queryClient, klass.id);
    },
  });

  const edit = (key: keyof Words) => (value: string) => {
    setSaved(false);
    setWords((current) => ({ ...current, [key]: value }));
  };
  const field = (key: keyof Words) => `${prefix}-${key}`;

  return (
    <section
      aria-labelledby={`${prefix}-heading`}
      className="bg-card shadow-card rounded-xl border"
    >
      <div className="px-4.5 pt-4 pb-3">
        <h2
          id={`${prefix}-heading`}
          className="text-[0.9375rem] font-semibold tracking-[-0.01em]"
        >
          {t("classDetail.classSettings")}
        </h2>
      </div>
      <form
        className="flex flex-col gap-3 px-4.5 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !save.isPending) save.mutate(words);
        }}
      >
        <Label htmlFor={field("name")}>{t("classDetail.className")}</Label>
        <Input
          id={field("name")}
          value={words.name}
          maxLength={120}
          readOnly={!canWrite}
          className="-mt-1.5"
          onChange={(event) => edit("name")(event.target.value)}
        />
        <Label htmlFor={field("description")}>
          {t("classDetail.classDescription")}
        </Label>
        <Textarea
          id={field("description")}
          value={words.description}
          rows={3}
          readOnly={!canWrite}
          className="-mt-1.5 min-h-18"
          onChange={(event) => edit("description")(event.target.value)}
        />
        <Label htmlFor={field("schedule")}>{t("classes.schedule")}</Label>
        {derived ? (
          <div className="-mt-1.5 flex flex-col gap-1.5">
            <DerivedField
              id={field("schedule")}
              label={t("classes.schedule")}
              value={derived.line}
              icon={Repeat}
              describedBy={`${field("schedule")}-hint`}
              action={
                canWrite
                  ? {
                      label: t("classes.changeInCalendar"),
                      icon: CalendarDays,
                      to: derived.calendar,
                    }
                  : undefined
              }
            />
            <Hint id={`${field("schedule")}-hint`}>{t("classes.fromSessions")}</Hint>
          </div>
        ) : (
          <Input
            id={field("schedule")}
            value={words.schedule}
            maxLength={120}
            readOnly={!canWrite}
            placeholder={t("classes.schedulePlaceholder")}
            className="-mt-1.5"
            onChange={(event) => edit("schedule")(event.target.value)}
          />
        )}
        <Label htmlFor={field("room")}>{t("classes.room")}</Label>
        <Input
          id={field("room")}
          value={words.room}
          maxLength={60}
          readOnly={!canWrite}
          placeholder={t("classes.roomPlaceholder")}
          aria-describedby={derived ? `${field("room")}-hint` : undefined}
          className="-mt-1.5"
          onChange={(event) => edit("room")(event.target.value)}
        />
        {derived ? (
          <Hint id={`${field("room")}-hint`} className="-mt-1.5">
            {t("classes.roomForNewSessions")}
          </Hint>
        ) : null}
        {save.isError ? (
          <p role="alert" className="text-danger-ink text-xs">
            {saveError(save.error, t("classDetail.saveFailed"))}
          </p>
        ) : null}
        {canWrite ? (
          <div className="flex items-center gap-2.5">
            <Button
              type="submit"
              className="h-8.5 px-3.5"
              aria-disabled={!ready || save.isPending || undefined}
            >
              {t("common.save")}
            </Button>
            {saved && !dirty ? (
              <span role="status" className="text-muted-fg text-xs">
                {t("classDetail.savedNote")}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}

function Hint({
  id,
  className,
  children,
}: Readonly<{ id: string; className?: string; children: string }>) {
  return (
    <p id={id} className={cn("text-muted-fg text-xs leading-[1.45]", className)}>
      {children}
    </p>
  );
}

function Label({ htmlFor, children }: Readonly<{ htmlFor: string; children: string }>) {
  return (
    <label htmlFor={htmlFor} className="text-meta font-medium">
      {children}
    </label>
  );
}
