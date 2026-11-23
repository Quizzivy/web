import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { FormDialog, type FormField } from "@/components/shared/form/FormDialog";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { formatDayMonth } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import {
  CALENDAR_KEY,
  updateClassSession,
  type ClassSession,
  type SessionPatch,
} from "../api";
import {
  editSessionDefaults,
  lengthOptions,
  sessionPatch,
  type EditSessionValues,
} from "../session";

/**
 * EditSessionDialog is "Sửa buổi này" (T-R8.11): the date, start, length,
 * room and note of one session, in the deck's form dialog. On a date of a
 * weekly series its first line says only this date changes. It sends only
 * what changed, and closes without a request when nothing did.
 */
export function EditSessionDialog({
  session,
  onOpenChange,
  returnFocus,
}: Readonly<{
  session: ClassSession | null;
  onOpenChange: (open: boolean) => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const zone = useDisplayTimeZone();
  const client = useQueryClient();
  const initial = useMemo(
    () => (session ? editSessionDefaults(session, zone) : null),
    [session, zone],
  );
  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SessionPatch }) =>
      updateClassSession(id, patch),
    onSuccess: async () => {
      onOpenChange(false);
      await client.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
  });
  const fields = useMemo(
    (): readonly FormField<EditSessionValues>[] => [
      {
        kind: "date",
        name: "date",
        label: t("calendar.session.edit.date"),
        required: true,
        noOptional: true,
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
        options: lengthOptions(session?.durationMinutes ?? 90).map((n) => ({
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
      {
        kind: "text",
        name: "note",
        label: t("calendar.session.edit.note"),
        placeholder: t("calendar.session.edit.notePlaceholder"),
        maxLength: 200,
      },
    ],
    [session, t],
  );
  return (
    <FormDialog
      open={session !== null}
      onOpenChange={(next) => {
        if (!next) save.reset();
        onOpenChange(next);
      }}
      title={
        session
          ? t("calendar.session.edit.title", {
              date: formatDayMonth(session.date, locale),
            })
          : ""
      }
      description={
        session?.seriesId != null ? t("calendar.session.edit.desc") : undefined
      }
      icon={Pencil}
      initial={initial ?? editBlank}
      fields={fields}
      submitLabel={t("calendar.session.edit.save")}
      pending={save.isPending}
      error={save.isError ? t("calendar.session.failed") : null}
      returnFocus={returnFocus}
      onSubmit={(values) => {
        if (session === null || initial === null || save.isPending) return;
        const patch = sessionPatch(initial, values);
        if (patch === null) onOpenChange(false);
        else save.mutate({ id: session.id, patch });
      }}
    />
  );
}

const editBlank: EditSessionValues = {
  date: "",
  time: "",
  dur: "90",
  room: "",
  note: "",
};
