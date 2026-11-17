import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  FileAudio,
  FileImage,
  FileText,
  FileType,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/shared/IconTile";
import { cn } from "@/lib/utils";
import { KIND_OF, useAttachmentMeta, type ChipFile, type Kind } from "../attachments";

const ICON: Record<Kind, LucideIcon> = {
  pdf: FileText,
  word: FileType,
  image: FileImage,
  audio: FileAudio,
};

/**
 * AttachmentChip is a file in a message (the R7 Messages proposal): a tile of
 * its kind, its name, its kind and size, and one action, Download for a file
 * that was sent or the × that takes a waiting file out of the composer, which
 * the staff side words (its name is not a student's string, T-R7.21). In a
 * bubble of the reader's own (`inverse`) it takes the bubble's colours; in a
 * card or the composer it is bordered on the page's ground. `meta` replaces
 * the second line, and `children` go under the row (an upload's progress).
 */
export function AttachmentChip({
  file,
  inverse = false,
  action,
  meta,
  className,
  children,
}: Readonly<{
  file: ChipFile;
  inverse?: boolean;
  action:
    | Readonly<{ kind: "download"; onClick: () => void; pending?: boolean }>
    | Readonly<{ kind: "remove"; onClick: () => void; label: string }>
    | null;
  meta?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
}>) {
  const { t } = useTranslation();
  const metaOf = useAttachmentMeta();
  const kind = file.mimeType === undefined ? "pdf" : KIND_OF[file.mimeType];
  return (
    <div
      data-slot="attachment-chip"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border py-2 pr-2 pl-3",
        inverse ? "bg-primary-fg/10 border-transparent" : "bg-bg",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconTile
          icon={ICON[kind]}
          size={32}
          className={inverse ? "bg-primary-fg/15 text-primary-fg" : undefined}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{file.filename}</span>
          <span
            className={cn("block text-xs", inverse ? "opacity-70" : "text-muted-fg")}
          >
            {meta ?? metaOf(file)}
          </span>
        </span>
        {action?.kind === "download" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "max-[767px]:size-10",
              inverse && "text-primary-fg hover:bg-primary-fg/15 hover:text-primary-fg",
            )}
            aria-label={t("messages.chip.download", { name: file.filename })}
            aria-disabled={action.pending || undefined}
            onClick={() => {
              if (!action.pending) action.onClick();
            }}
          >
            <Download className="size-4" />
          </Button>
        )}
        {action?.kind === "remove" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-fg max-[767px]:size-10"
            aria-label={action.label}
            onClick={action.onClick}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
