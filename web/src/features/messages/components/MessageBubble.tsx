import { useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "../api";
import { Linkified } from "../linkify";
import { AttachmentChip } from "./AttachmentChip";

/** SendStatus is where a message of the reader's own stands: sent, on its way, or refused. */
export type SendStatus = "sent" | "sending" | "failed";

/**
 * SendLine is what stands under a message of the reader's own: its time once
 * it is sent, "Sending…" while it travels, and "Not sent." with Retry when it
 * failed, which keeps the words (the R7 Messages proposal).
 */
export function SendLine({
  status,
  time,
  onRetry,
}: Readonly<{ status: SendStatus; time: string; onRetry?: (() => void) | undefined }>) {
  const { t } = useTranslation();
  if (status === "sending")
    return (
      <span className="text-muted-fg text-caption px-1">{t("messages.sending")}</span>
    );
  if (status === "failed")
    return (
      <span
        role="alert"
        className="text-danger-ink flex items-center gap-1 px-1 text-xs"
      >
        <CircleAlert aria-hidden="true" className="size-3.5 flex-none" />
        {t("messages.failed")}
        {onRetry && (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="text-fg h-auto px-0 font-semibold underline underline-offset-2 max-[767px]:min-h-10"
            onClick={onRetry}
          >
            {t("common.retry")}
          </Button>
        )}
      </span>
    );
  return <span className="text-muted-fg text-caption px-1">{time}</span>;
}

/**
 * MessageBubble is one message of a direct thread: the reader's own on the
 * right in `primary`, the other side's on the left in a bordered card, the
 * time below (DG-91). A file sits in its sender's bubble as a chip, with the
 * text the message carried above it. The body is plain text whose web
 * addresses are links.
 */
export function MessageBubble({
  mine,
  body,
  attachment,
  time,
  status = "sent",
  onRetry,
  onDownload,
  downloading = false,
}: Readonly<{
  mine: boolean;
  body: string | null;
  attachment: MessageAttachment | null;
  time: string;
  status?: SendStatus;
  onRetry?: () => void;
  onDownload?: ((attachment: MessageAttachment) => void) | undefined;
  downloading?: boolean;
}>) {
  return (
    <div
      data-slot="message-bubble"
      data-mine={mine || undefined}
      className={cn(
        "flex max-w-[min(520px,86%)] flex-col gap-1",
        mine ? "items-end self-end" : "items-start self-start",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 rounded-2xl border text-base leading-normal text-pretty",
          attachment === null ? "px-3 py-2" : "p-2",
          mine ? "bg-primary text-primary-fg border-primary" : "bg-card text-fg",
          status === "sending" && "opacity-60",
        )}
      >
        {body !== null && (
          <span
            className={cn(
              "[overflow-wrap:anywhere] break-words whitespace-pre-wrap",
              attachment !== null && "px-1 pt-1",
            )}
          >
            <Linkified body={body} linkClassName="underline underline-offset-2" />
          </span>
        )}
        {attachment !== null && (
          <AttachmentChip
            file={attachment}
            inverse={mine}
            action={
              onDownload === undefined || status !== "sent"
                ? null
                : {
                    kind: "download",
                    onClick: () => onDownload(attachment),
                    pending: downloading,
                  }
            }
          />
        )}
      </div>
      <SendLine status={status} time={time} onRetry={onRetry} />
    </div>
  );
}
