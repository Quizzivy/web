import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquareText } from "lucide-react";
import { FormDialog } from "@/components/shared/form/FormDialog";

/** NOTE_MAX is the longest note the server keeps on a mark. */
export const NOTE_MAX = 500;

type Values = { note: string };

/**
 * NoteDialog writes a note on one student's mark, as the deck draws it:
 * "Note for {name}", who reads it, and up to 500 characters. Saving puts the
 * note in the session's unsaved marks, like a status; an empty note removes
 * the one there was.
 */
export function NoteDialog({
  name,
  note,
  open,
  onOpenChange,
  onSave,
  returnFocus,
}: Readonly<{
  name: string;
  note: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: string) => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  return (
    <FormDialog<Values>
      open={open}
      onOpenChange={onOpenChange}
      icon={MessageSquareText}
      title={t("attendance.note.title", { name })}
      description={t("attendance.note.description")}
      initial={{ note }}
      fields={[
        {
          kind: "area",
          name: "note",
          label: t("attendance.note.label"),
          placeholder: t("attendance.note.placeholder"),
          maxLength: NOTE_MAX,
          noOptional: true,
        },
      ]}
      submitLabel={t("attendance.note.save")}
      onSubmit={(values) => {
        onSave(values.note);
        onOpenChange(false);
      }}
      returnFocus={returnFocus}
    />
  );
}
