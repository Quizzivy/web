import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { FormDialog, type FormField } from "@/components/shared/form/FormDialog";
import { fetchClasses } from "@/features/classes/api";
import { blankAsNull } from "@/features/classes/classFields";
import { ApiError } from "@/lib/api/errors";
import { formatClock, minutesOf } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import {
  CALENDAR_KEY,
  createClassSession,
  getCalendar,
  type CalendarTerm,
  type ClassSession,
} from "../api";
import {
  LENGTHS,
  PICKER_KEY,
  followClass,
  newSessionDefaults,
  repeatHint,
  validateNewSession,
  type NewSessionValues,
} from "../newSession";
import { addDays } from "../week";

function failure(cause: unknown, t: TFunction): string {
  if (cause instanceof ApiError) {
    if (cause.code === "CLASS_ARCHIVED") return t("calendar.new.archived");
    if (cause.status === 400 && typeof cause.details?.["date"] === "string")
      return t("calendar.new.dateTooFar");
  }
  return t("calendar.new.failed");
}

/**
 * NewSessionDialog is the deck's New session form (T-R8.10): Class (the
 * caller's classes), Date (today), Starts (18:00), Length (60, 90 or 120
 * minutes, 90), Room (the class's own room, "Phòng 2" as its placeholder)
 * and Repeat every week (on), whose hint names the end of the term that
 * holds the date, from `terms`. Add session toasts "Session added · {class},
 * {time}", makes every calendar week stale and hands the new session to
 * `onCreated`.
 *
 * `terms` are the calendar's, which hold every term ending on or after
 * `termsFrom`; when that is after today the dialog reads the terms from today
 * on as well, so a date from today on finds its term.
 */
export function NewSessionDialog({
  open,
  onOpenChange,
  today,
  terms,
  termsFrom,
  onCreated,
  returnFocus,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  terms: readonly CalendarTerm[];
  termsFrom: string;
  onCreated?: ((session: ClassSession) => void) | undefined;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const classes = useQuery({
    queryKey: PICKER_KEY,
    queryFn: ({ signal }) => fetchClasses({ limit: 100 }, signal),
  });
  const ahead = useQuery({
    queryKey: [...CALENDAR_KEY, today, addDays(today, 1)],
    queryFn: ({ signal }) => getCalendar(today, addDays(today, 1), signal),
    enabled: open && termsFrom > today,
  });
  const items = useMemo(() => classes.data?.items ?? [], [classes.data]);
  const known = useMemo(() => {
    const all = [...terms, ...(ahead.data?.terms ?? [])];
    return all.filter(
      (term, index) => all.findIndex((other) => other.id === term.id) === index,
    );
  }, [terms, ahead.data]);

  const create = useMutation({
    mutationFn: (values: NewSessionValues) =>
      createClassSession(values.cls, {
        date: values.date,
        startTime: values.time,
        durationMinutes: Number(values.dur),
        room: blankAsNull(values.room),
        repeatWeekly: values.rep,
      }),
    onSuccess: async (session, values) => {
      onOpenChange(false);
      notify.success(
        t("calendar.new.added", {
          class: session.className,
          time: formatClock(minutesOf(values.time)),
        }),
      );
      onCreated?.(session);
      await Promise.all([
        client.invalidateQueries({ queryKey: CALENDAR_KEY }),
        client.invalidateQueries({ queryKey: ["teacher-classes"] }),
      ]);
    },
  });

  const fields = useMemo(
    (): readonly FormField<NewSessionValues>[] => [
      {
        kind: "select",
        name: "cls",
        label: t("calendar.new.class"),
        placeholder: t("calendar.new.classPlaceholder"),
        options: items.map((klass) => ({ value: klass.id, label: klass.name })),
        required: true,
      },
      {
        kind: "date",
        name: "date",
        label: t("calendar.new.date"),
        required: true,
        noOptional: true,
      },
      {
        kind: "time",
        name: "time",
        label: t("calendar.new.starts"),
        required: true,
        noOptional: true,
      },
      {
        kind: "seg",
        name: "dur",
        label: t("calendar.new.length"),
        options: LENGTHS.map((n) => ({
          value: n,
          label: t("calendar.new.minutes", { n }),
        })),
      },
      {
        kind: "text",
        name: "room",
        label: t("calendar.new.room"),
        placeholder: t("calendar.new.roomPlaceholder"),
        maxLength: 60,
      },
      {
        kind: "toggle",
        name: "rep",
        text: t("calendar.new.repeat"),
        hint: (values) => repeatHint(values, known, t, locale),
      },
    ],
    [items, known, t, locale],
  );

  const derive = useMemo(() => followClass(items), [items]);
  const none = classes.isSuccess && items.length === 0;

  return (
    <FormDialog
      key={classes.isSuccess ? "ready" : "waiting"}
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset();
        onOpenChange(next);
      }}
      title={t("calendar.new.title")}
      description={none ? t("calendar.new.noClasses") : undefined}
      icon={CalendarPlus}
      initial={newSessionDefaults(items, today)}
      fields={fields}
      derive={derive}
      validate={(values) => validateNewSession(values, today, t)}
      submitLabel={t("calendar.new.submit")}
      pending={create.isPending}
      disabled={!classes.isSuccess || none}
      error={create.isError ? failure(create.error, t) : null}
      returnFocus={returnFocus}
      onSubmit={(values) => {
        if (!create.isPending) create.mutate(values);
      }}
    />
  );
}
