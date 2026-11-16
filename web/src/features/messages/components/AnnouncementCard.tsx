import { useTranslation } from "react-i18next";
import { Eye, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageAttachment, SeenBy } from "../api";
import { Linkified } from "../linkify";
import { AttachmentChip } from "./AttachmentChip";
import { SendLine, type SendStatus } from "./MessageBubble";

/**
 * AnnouncementCard is a post of a class channel, centred in the stream:
 * "Announcement · {time}", the text, a file it carries, and for staff the eye
 * with "Seen by {seen} of {of}". A student's channel passes no `seenBy`
 * (DG-91: read receipts are the teacher's). An announcement of the reader's
 * own that is on its way, or failed, says so under the card.
 */
export function AnnouncementCard({
  body,
  attachment,
  time,
  seenBy,
  status = "sent",
  onRetry,
  onDownload,
  downloading = false,
}: Readonly<{
  body: string | null;
  attachment: MessageAttachment | null;
  time: string;
  seenBy?: SeenBy | undefined;
  status?: SendStatus;
  onRetry?: () => void;
  onDownload?: ((attachment: MessageAttachment) => void) | undefined;
  downloading?: boolean;
}>) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full max-w-155 flex-col items-center gap-1 self-center">
      <article
        data-slot="announcement"
        className={cn(
          "bg-card shadow-card flex w-full flex-col gap-2 rounded-xl border px-4 py-3",
          status === "sending" && "opacity-60",
        )}
      >
        <p className="text-muted-fg flex items-center gap-2 text-xs">
          <Megaphone aria-hidden="true" className="size-3.5 flex-none" />
          {t("messages.announcement", {
            time: status === "sent" ? time : t("messages.sending"),
          })}
        </p>
        {body !== null && (
          <p className="text-base leading-relaxed text-pretty [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
            <Linkified body={body} linkClassName="underline underline-offset-2" />
          </p>
        )}
        {attachment !== null && (
          <AttachmentChip
            file={attachment}
            className="max-w-85"
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
        {seenBy !== undefined && status === "sent" && (
          <p className="text-muted-fg flex items-center gap-2 border-t pt-2 text-xs">
            <Eye aria-hidden="true" className="size-3.5 flex-none" />
            {t("messages.seenBy", { seen: seenBy.seen, of: seenBy.of })}
          </p>
        )}
      </article>
      {status === "failed" && <SendLine status="failed" time="" onRetry={onRetry} />}
    </div>
  );
}
