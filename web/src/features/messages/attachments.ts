import { useTranslation } from "react-i18next";
import { formatBytes } from "@/features/media/format";
import { ApiError } from "@/lib/api/errors";
import type { MessageAttachment } from "./api";

export type Kind = "pdf" | "word" | "image" | "audio";

export const KIND_OF: Record<MessageAttachment["mimeType"], Kind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/msword": "word",
  "image/png": "image",
  "image/jpeg": "image",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
};

/** ChipFile is what a chip names: a stored attachment, or a file still on its way up. */
export type ChipFile = Readonly<{
  filename: string;
  bytes: number;
  mimeType?: MessageAttachment["mimeType"] | undefined;
}>;

/**
 * useAttachmentMeta words a chip's second line, the kind and the size: "PDF · 1.2
 * MB", "Word · 340 KB".
 */
export function useAttachmentMeta() {
  const { t } = useTranslation();
  return (file: ChipFile) => {
    const size = formatBytes(file.bytes);
    if (file.mimeType === undefined) return size;
    return t("messages.chip.meta", {
      kind: t(`messages.chip.kind.${KIND_OF[file.mimeType]}`),
      size,
    });
  };
}

/** refusalKey names the sentence for an upload the server refused (T-R7.11). */
export function refusalKey(cause: unknown): string {
  if (!(cause instanceof ApiError)) return "messages.attach.failed";
  if (cause.status === 413 || cause.code === "MEDIA_TOO_LARGE")
    return "messages.attach.tooBig";
  if (cause.code === "ATTACHMENT_HAS_MACROS") return "messages.attach.macro";
  if (cause.code === "IMAGE_DIMENSIONS") return "messages.attach.dimensions";
  if (cause.status === 415) return "messages.attach.badType";
  if (cause.status === 429) return "messages.attach.limit";
  return "messages.attach.failed";
}
