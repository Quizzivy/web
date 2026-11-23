import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleStop, Repeat } from "lucide-react";
import { Callout } from "@/components/shared/Callout";
import { FormDialog, type FormField } from "@/components/shared/form/FormDialog";
import { ApiError } from "@/lib/api/errors";
import { formatDayMonth, weekdayAbbr, weekdayInSentence } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import {
  CALENDAR_KEY,
  endSessionSeries,
  updateSessionSeries,
  type ClassSession,
  type SeriesPatch,
} from "../api";
import {
  attendedToday,
  earliestLastDate,
  lengthOptions,
  seriesDefaults,
  seriesPatch,
  type EditSeriesValues,
} from "../session";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** seriesLine is a dialog's second line: "IELTS 6.5 Evening · Mỗi thứ Sáu". */
function seriesLine(session: ClassSession, t: TFunction, locale: "vi" | "en"): string {
  const weekday = session.series?.weekday ?? 1;
  return `${session.className} · ${t("calendar.session.every", {
    weekday: weekdayInSentence(weekday, locale),
  })}`;
}

/** The queries a change to a series makes stale: every week, and the classes' derived schedule. */
async function refresh(client: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    client.invalidateQueries({ queryKey: CALENDAR_KEY }),
    client.invalidateQueries({ queryKey: ["teacher-classes"] }),
  ]);
}

/**
 * EditSeriesDialog is "Sửa lịch lặp lại" (T-R8.11): a weekly session from a
 * date on, by default its next date, with its weekday, start, length and
 * room. Under From it says "Các buổi trước ngày {date} giữ nguyên.", or, when
 * today's date already has attendance and the change starts today, that the
 * change starts tomorrow, as the server will make it. Before saving it warns
 * that single dates changed from then on follow the new schedule; after, the
 * toast counts those it cleared.
 */
export function EditSeriesDialog({
  session,
  today,
  onOpenChange,
  returnFocus,
}: Readonly<{
  session: ClassSession | null;
  today: string;
  onOpenChange: (open: boolean) => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const series = session?.series ?? null;
  const initial = useMemo(
    () => (series ? seriesDefaults(series, today) : null),
    [series, today],
  );
  const attended = session !== null && attendedToday(session, today);
  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SeriesPatch }) =>
      updateSessionSeries(id, patch),
    onSuccess: async ({ droppedChanges }) => {
      onOpenChange(false);
      notify.success(
        droppedChanges > 0
          ? t("calendar.session.toast.cleared", { count: droppedChanges })
          : t("calendar.session.toast.series"),
      );
      await refresh(client);
    },
  });
  const fields = useMemo(
    (): readonly FormField<EditSeriesValues>[] => [
      {
        kind: "date",
        name: "from",
        label: t("calendar.session.series.from"),
        required: true,
        noOptional: true,
        hint: (values) =>
          attended && values.from === today
            ? t("calendar.session.series.fromTomorrow")
            : t("calendar.session.series.fromHint", {
                date: formatDayMonth(values.from || today, locale),
              }),
      },
      {
        kind: "seg",
        name: "weekday",
        label: t("calendar.session.series.weekday"),
        options: WEEKDAYS.map((day) => ({
          value: String(day),
          label: weekdayAbbr(day, locale),
        })),
      },
      {
        kind: "time",
        name: "time",
        label: t("calendar.session.edit.start"),
        required: true,
        noOptional: true,
      },
      {
        kind: "seg",
        name: "dur",
        label: t("calendar.session.edit.length"),
        options: lengthOptions(series?.durationMinutes ?? 90).map((n) => ({
          value: n,
          label: t("calendar.new.minutes", { n }),
        })),
      },
      {
        kind: "text",
        name: "room",
        label: t("calendar.session.edit.room"),
        placeholder: t("calendar.new.roomPlaceholder"),
        maxLength: 60,
        noOptional: true,
      },
    ],
    [attended, locale, series, t, today],
  );
  return (
    <FormDialog
      open={session !== null && series !== null}
      onOpenChange={(next) => {
        if (!next) save.reset();
        onOpenChange(next);
      }}
      title={t("calendar.session.series.title")}
      description={session ? seriesLine(session, t, locale) : undefined}
      icon={Repeat}
      initial={initial ?? seriesBlank}
      fields={fields}
      validate={(values) =>
        values.from !== "" && values.from < today
          ? { from: t("calendar.session.series.fromPast") }
          : null
      }
      submitLabel={t("calendar.session.series.save")}
      pending={save.isPending}
      error={save.isError ? t("calendar.session.failed") : null}
      returnFocus={returnFocus}
      onSubmit={(values) => {
        if (series === null || initial === null || save.isPending) return;
        const patch = seriesPatch(initial, values);
        if (patch === null) onOpenChange(false);
        else save.mutate({ id: series.id, patch });
      }}
    >
      <Callout tone="warning" size="sm">
        {t("calendar.session.series.warn")}
      </Callout>
    </FormDialog>
  );
}

const seriesBlank: EditSeriesValues = {
  from: "",
  weekday: "1",
  time: "",
  dur: "90",
  room: "",
};

type StopValues = { last: string };

function stopFailure(cause: unknown, t: TFunction): string {
  if (cause instanceof ApiError && cause.code === "SESSION_HAS_ATTENDANCE")
    return t("calendar.session.stop.hasAttendance");
  return t("calendar.session.failed");
}

/**
 * StopRepeatingDialog is "Dừng lặp lại" (T-R8.11): one field, the last date
 * the series meets, by default the date the teacher pressed, and the line
 * that says what goes and what is kept. A last date before the series' first
 * removes it, which the server answers with no body.
 */
export function StopRepeatingDialog({
  session,
  today,
  onOpenChange,
  returnFocus,
}: Readonly<{
  session: ClassSession | null;
  today: string;
  onOpenChange: (open: boolean) => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const stop = useMutation({
    mutationFn: ({ id, last }: { id: string; last: string }) =>
      endSessionSeries(id, last),
    onSuccess: async (_, { last }) => {
      onOpenChange(false);
      notify.success(
        t("calendar.session.toast.stopped", { date: formatDayMonth(last, locale) }),
      );
      await refresh(client);
    },
  });
  const fields = useMemo(
    (): readonly FormField<StopValues>[] => [
      {
        kind: "date",
        name: "last",
        label: t("calendar.session.stop.last"),
        required: true,
        noOptional: true,
        hint: t("calendar.session.stop.lastHint"),
      },
    ],
    [t],
  );
  return (
    <FormDialog
      open={session?.seriesId != null}
      onOpenChange={(next) => {
        if (!next) stop.reset();
        onOpenChange(next);
      }}
      title={t("calendar.session.stop.title")}
      description={session ? seriesLine(session, t, locale) : undefined}
      icon={CircleStop}
      initial={{ last: session?.date ?? today }}
      fields={fields}
      validate={(values) =>
        values.last !== "" && values.last < earliestLastDate(today)
          ? { last: t("calendar.session.stop.lastPast") }
          : null
      }
      submitLabel={t("calendar.session.act.stop")}
      pending={stop.isPending}
      error={stop.isError ? stopFailure(stop.error, t) : null}
      returnFocus={returnFocus}
      onSubmit={(values) => {
        if (session?.seriesId == null || stop.isPending) return;
        stop.mutate({ id: session.seriesId, last: values.last });
      }}
    />
  );
}
