import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { FormDialog } from "@/components/shared/form/FormDialog";
import { toast } from "@/components/ui/sonner";
import { updateClass, type ClassListItem } from "@/features/classes/api";
import {
  blankAsNull,
  classFields,
  derivedSchedule,
  saveError,
  type ClassFieldValues,
} from "@/features/classes/classFields";
import { invalidateClass } from "@/features/classes/invalidate";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";

/**
 * EditClassDialog is the card menu's "Edit class": the class's name,
 * schedule and room, saved together, a cleared schedule or room saved as
 * none. The room is the class's own (`ownRoom`), never the derived one. A
 * class with repeating sessions shows its schedule read-only, worked out from
 * them, with "Đổi trong Lịch" opening the calendar at its next session, and
 * its free-text label is left as it is (T-R8.14). It is open while `klass` is
 * set; focus goes back to `returnFocus`.
 */
export function EditClassDialog({
  klass,
  onClose,
  returnFocus,
}: Readonly<{
  klass: Pick<
    ClassListItem,
    "id" | "name" | "scheduleLabel" | "ownRoom" | "schedule"
  > | null;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const zone = useDisplayTimeZone();
  const derived = useMemo(
    () => derivedSchedule(klass?.schedule, locale, zone, new Date()),
    [klass, locale, zone],
  );
  const fields = useMemo(() => classFields(t, derived), [t, derived]);
  const initial = useMemo<ClassFieldValues>(
    () => ({
      name: klass?.name ?? "",
      schedule: klass?.scheduleLabel ?? "",
      room: klass?.ownRoom ?? "",
    }),
    [klass],
  );

  const save = useMutation({
    mutationFn: ({
      id,
      values,
      typed,
    }: {
      id: string;
      values: ClassFieldValues;
      typed: boolean;
    }) =>
      updateClass(id, {
        name: values.name.trim(),
        ...(typed ? { scheduleLabel: blankAsNull(values.schedule) } : {}),
        room: blankAsNull(values.room),
      }),
    onSuccess: async (_, { id }) => {
      onClose();
      toast(t("classes.updated"));
      await invalidateClass(queryClient, id);
    },
  });

  const error = save.isError ? saveError(save.error, t("classes.updateFailed")) : null;

  return (
    <FormDialog
      open={klass !== null}
      onOpenChange={(next) => {
        if (next) return;
        save.reset();
        onClose();
      }}
      title={t("classes.edit")}
      icon={Pencil}
      initial={initial}
      fields={fields}
      submitLabel={t("common.saveChanges")}
      pending={save.isPending}
      error={error}
      returnFocus={returnFocus}
      onSubmit={(values) => {
        if (klass !== null && !save.isPending)
          save.mutate({ id: klass.id, values, typed: derived === null });
      }}
    />
  );
}
