import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MessageAttachment } from "../api";
import { AttachDialog, type Upload } from "./AttachDialog";
import { AttachmentChip } from "./AttachmentChip";
import type { ComposerAttach } from "./Composer";

/**
 * staffAttach is the staff composer's file (T-R7.20): Attach file beside
 * Send, which opens the dialog, and the uploaded file waiting above the box
 * as a chip with its ×. A student's composer has neither (T-R7.21), so its
 * page never loads the dialog or its strings.
 */
export function staffAttach(upload: Upload): ComposerAttach {
  return function attach({ draft, setAttachment }) {
    return {
      waiting:
        draft.attachment === null ? null : (
          <WaitingFile file={draft.attachment} onRemove={() => setAttachment(null)} />
        ),
      button: <AttachButton upload={upload} onAttach={setAttachment} />,
    };
  };
}

function WaitingFile({
  file,
  onRemove,
}: Readonly<{ file: MessageAttachment; onRemove: () => void }>) {
  const { t } = useTranslation();
  return (
    <AttachmentChip
      file={file}
      className="bg-card max-w-85 self-start"
      action={{
        kind: "remove",
        onClick: onRemove,
        label: t("messages.chip.remove", { name: file.filename }),
      }}
    />
  );
}

function AttachButton({
  upload,
  onAttach,
}: Readonly<{ upload: Upload; onAttach: (attachment: MessageAttachment) => void }>) {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        ref={button}
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-fg data-[open=true]:bg-hover size-8 max-[767px]:size-10"
        data-open={open || undefined}
        aria-label={t("messages.attachFile")}
        onClick={() => setOpen(true)}
      >
        <Paperclip className="size-4" />
      </Button>
      <AttachDialog
        open={open}
        onOpenChange={setOpen}
        upload={upload}
        returnFocus={button}
        onAttach={onAttach}
      />
    </>
  );
}
