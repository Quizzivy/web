import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";
import { FileDrop } from "@/components/shared/form/FileDrop";
import { FormDialog } from "@/components/shared/form/FormDialog";
import type { UploadOptions } from "@/lib/api/client";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  type MessageAttachment,
} from "../api";
import { refusalKey } from "../attachments";
import { AttachmentChip } from "./AttachmentChip";

/** Upload stores one file for a message and answers what was stored. */
export type Upload = (file: File, options: UploadOptions) => Promise<MessageAttachment>;

type Phase =
  | Readonly<{ kind: "pick"; error: string | null }>
  | Readonly<{ kind: "uploading"; file: File; fraction: number }>
  | Readonly<{ kind: "ready"; attachment: MessageAttachment }>;

const PICK: Phase = { kind: "pick", error: null };

/**
 * AttachDialog chooses one file and uploads it, and Attach hands what was
 * stored to the composer. It sends nothing (the owner, 2026-11-13, Q3): the
 * file waits in the composer until Send. Its states are the proposal's:
 * nothing chosen, uploading with its progress, ready, and refused for size,
 * kind, macros or too many uploads in an hour, each refusal with the field
 * open for another file. A file over 20 MB is refused before it is sent.
 * Closing the dialog stops an upload; a file stored and never attached is
 * left to the server's daily sweep.
 */
export function AttachDialog({
  open,
  onOpenChange,
  upload,
  onAttach,
  returnFocus,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  upload: Upload;
  onAttach: (attachment: MessageAttachment) => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>(PICK);
  const errorId = useId();
  const running = useRef<AbortController | null>(null);

  const stop = () => {
    running.current?.abort();
    running.current = null;
  };
  useEffect(() => stop, []);

  const close = (next: boolean) => {
    if (!next) {
      stop();
      setPhase(PICK);
    }
    onOpenChange(next);
  };

  const choose = (file: File | null) => {
    stop();
    if (file === null) {
      setPhase(PICK);
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setPhase({ kind: "pick", error: t("messages.attach.tooBig") });
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setPhase({ kind: "uploading", file, fraction: 0 });
    upload(file, {
      signal: controller.signal,
      onProgress: (fraction) => {
        if (running.current === controller)
          setPhase({ kind: "uploading", file, fraction });
      },
    }).then(
      (attachment) => {
        if (running.current !== controller) return;
        running.current = null;
        setPhase({ kind: "ready", attachment });
      },
      (cause: unknown) => {
        if (running.current !== controller) return;
        running.current = null;
        setPhase({ kind: "pick", error: t(refusalKey(cause)) });
      },
    );
  };

  const percent = phase.kind === "uploading" ? Math.round(phase.fraction * 100) : 0;
  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={t("messages.attach.title")}
      icon={Paperclip}
      width={460}
      initial={{}}
      fields={[]}
      submitLabel={t("messages.attach.submit")}
      disabled={phase.kind !== "ready"}
      returnFocus={returnFocus}
      onSubmit={() => {
        if (phase.kind !== "ready") return;
        onAttach(phase.attachment);
        setPhase(PICK);
        onOpenChange(false);
      }}
    >
      {phase.kind === "pick" && (
        <div className="flex flex-col gap-3">
          <FileDrop
            value={null}
            onChange={choose}
            accept={ATTACHMENT_ACCEPT}
            placeholder={t("messages.attach.choose")}
            limits={t("messages.attach.accept")}
            invalid={phase.error !== null}
            aria-describedby={phase.error === null ? undefined : errorId}
          />
          {phase.error !== null && (
            <p
              id={errorId}
              role="alert"
              className="text-danger-ink text-meta text-pretty"
            >
              {phase.error}
            </p>
          )}
        </div>
      )}
      {phase.kind === "uploading" && (
        <AttachmentChip
          file={{ filename: phase.file.name, bytes: phase.file.size }}
          meta={t("messages.attach.uploading", { percent })}
          action={{ kind: "remove", onClick: () => choose(null) }}
        >
          <div
            role="progressbar"
            aria-label={t("messages.attach.progress", { name: phase.file.name })}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="bg-muted h-1 overflow-hidden rounded-full"
          >
            <span
              className="bg-brand block h-full transition-[width] motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
        </AttachmentChip>
      )}
      {phase.kind === "ready" && (
        <AttachmentChip
          file={phase.attachment}
          action={{ kind: "remove", onClick: () => choose(null) }}
        />
      )}
    </FormDialog>
  );
}
