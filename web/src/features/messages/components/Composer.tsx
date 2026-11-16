import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BODY_MAX, outgoingOf, sendsOnEnter, type Outgoing } from "../compose";
import type { Draft } from "../drafts";
import { AttachDialog, type Upload } from "./AttachDialog";
import { AttachmentChip } from "./AttachmentChip";

const GROW_MAX_PX = 120;

/**
 * Composer writes a message: a textarea that grows with its text up to
 * 120px, the waiting file as a chip with its ×, Attach file (`upload`, staff
 * only), and Send, which is paused while there is neither text nor a file.
 * The draft is the caller's (`useDraft`), kept per thread. `hint` is the line
 * under the box, the class channel's "Sent to all {n} students…".
 * Each new `focusRequest` puts the caret in the box (New announcement).
 */
export function Composer({
  draft,
  onDraft,
  onSend,
  placeholder,
  enterSends,
  upload,
  hint,
  focusRequest,
}: Readonly<{
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onSend: (outgoing: Outgoing) => void;
  placeholder: string;
  enterSends: boolean;
  upload?: Upload | undefined;
  hint?: string | undefined;
  focusRequest?: string | undefined;
}>) {
  const { t } = useTranslation();
  const field = useRef<HTMLTextAreaElement>(null);
  const attachButton = useRef<HTMLButtonElement>(null);
  const [attaching, setAttaching] = useState(false);
  const outgoing = outgoingOf(draft);

  useLayoutEffect(() => {
    const node = field.current;
    if (node === null) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, GROW_MAX_PX)}px`;
  }, [draft.text]);

  const send = () => {
    if (outgoing === null) return;
    onSend(outgoing);
    onDraft({ text: "", attachment: null });
    field.current?.focus();
  };

  useEffect(() => {
    if (focusRequest !== undefined) field.current?.focus();
  }, [focusRequest]);

  return (
    <div className="flex flex-none flex-col gap-2 border-t p-3">
      <div className="bg-bg has-[textarea:focus-visible]:outline-focus border-input flex flex-col gap-2 rounded-lg border py-2 pr-2 pl-3 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2">
        {draft.attachment !== null && (
          <AttachmentChip
            file={draft.attachment}
            className="bg-card max-w-85 self-start"
            action={{
              kind: "remove",
              onClick: () => onDraft({ ...draft, attachment: null }),
            }}
          />
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={field}
            rows={1}
            value={draft.text}
            maxLength={BODY_MAX}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(event) => onDraft({ ...draft, text: event.target.value })}
            onKeyDown={(event) => {
              if (!sendsOnEnter(event, enterSends)) return;
              event.preventDefault();
              send();
            }}
            className="max-h-30 min-h-0 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-1 leading-normal outline-none!"
          />
          {upload !== undefined && (
            <Button
              ref={attachButton}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-fg data-[open=true]:bg-hover size-8 max-[767px]:size-10"
              data-open={attaching || undefined}
              aria-label={t("messages.attachFile")}
              onClick={() => setAttaching(true)}
            >
              <Paperclip className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            size="icon-sm"
            className="size-8 max-[767px]:size-10"
            aria-label={t("messages.send")}
            aria-disabled={outgoing === null || undefined}
            onClick={send}
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
      {hint !== undefined && (
        <p className="text-muted-fg px-1 text-xs text-pretty">{hint}</p>
      )}
      {upload !== undefined && (
        <AttachDialog
          open={attaching}
          onOpenChange={setAttaching}
          upload={upload}
          returnFocus={attachButton}
          onAttach={(attachment) => {
            onDraft({ ...draft, attachment });
            field.current?.focus();
          }}
        />
      )}
    </div>
  );
}
