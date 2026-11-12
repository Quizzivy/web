import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AudioLines,
  ChevronDown,
  Image as ImageIcon,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowMenu } from "@/components/shared/RowMenu";
import { audioLength } from "@/lib/i18n/datetime";
import type { LibraryAsset, MediaAsset } from "@/features/media/api";
import { AssetLibraryDialog } from "@/features/media/components/AssetLibraryDialog";
import { AudioPlayer } from "@/features/media/components/AudioPlayer";
import { FileInput } from "@/features/media/components/FileInput";
import { UploadStatus } from "@/features/media/components/UploadStatus";
import { openFilePicker } from "@/features/media/filePicker";
import { formatBytes } from "@/features/media/format";
import { useMediaUpload } from "@/features/media/useMediaUpload";
import { AudioPolicyPanel } from "@/features/question-bank/components/AudioPolicyPanel";
import { cn } from "@/lib/utils";
import { policySummary } from "../materialParts";
import type { GroupRecording } from "../model";

const CARD = "bg-card shadow-card overflow-hidden rounded-xl border";

/**
 * RecordingPicker is where a group's recording is chosen: a file from the
 * computer or one from Media, with the upload's progress and failure under
 * it. `onCancel` adds a way back for a host that opened it over something.
 */
export function RecordingPicker({
  onPick,
  onCancel,
}: Readonly<{
  onPick: (asset: MediaAsset | LibraryAsset) => void;
  onCancel?: (() => void) | undefined;
}>) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const upload = useMediaUpload({ kind: "audio", onUploaded: onPick });
  return (
    <div className={CARD}>
      <div className="p-4">
        <div className="border-ring flex flex-col items-center gap-2.5 rounded-[10px] border border-dashed px-5 py-8 text-center max-[767px]:px-4 max-[767px]:py-6">
          <span className="bg-muted grid size-10 place-items-center rounded-[11px]">
            <AudioLines aria-hidden="true" className="size-4.75" />
          </span>
          <span className="text-sm font-semibold">{t("groups.pane.audioDrop")}</span>
          <span className="text-muted-fg text-[12.5px]">
            {t("groups.pane.audioLimits")}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="md"
              className="h-9 max-[767px]:h-11"
              disabled={upload.busy}
              onClick={() => openFilePicker(fileInput.current, "audio")}
            >
              <Upload aria-hidden="true" />
              {t("questionEditor.questionMedia.choose")}
            </Button>
            <Button
              ref={library}
              type="button"
              variant="outline"
              size="md"
              className="h-9 shadow-none max-[767px]:h-11"
              disabled={upload.busy}
              onClick={() => setPicking(true)}
            >
              <ImageIcon aria-hidden="true" />
              {t("questionEditor.questionMedia.fromMedia")}
            </Button>
            {onCancel ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="h-9 max-[767px]:h-11"
                onClick={() => {
                  upload.cancel();
                  onCancel();
                }}
              >
                {t("common.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
        <UploadStatus
          state={upload.state}
          kind="audio"
          onCancel={upload.cancel}
          onRetry={() => openFilePicker(fileInput.current, "audio")}
        />
        <FileInput
          inputRef={fileInput}
          kind="audio"
          onFile={(file) => void upload.start(file)}
        />
      </div>
      <AssetLibraryDialog
        open={picking}
        onOpenChange={setPicking}
        kind="audio"
        returnFocus={library}
        onPick={onPick}
        onUploadNew={() => openFilePicker(fileInput.current, "audio")}
      />
    </div>
  );
}

/**
 * RecordingCard is a group's recording in the pane's left half: the file with
 * "Replace file" and its menu, a player, and the listening rules, the four of
 * `AudioPolicyPanel` with the transcript. With `compact`, for a recording
 * that has a text under it, the rules fold to one line that opens them.
 * "Replace file" opens the picker in the card's place until a file is chosen
 * or it is cancelled. `onRemove` is the menu's "Remove the recording", left
 * out when the host gives none.
 */
export function RecordingCard({
  recording,
  asset,
  label,
  compact,
  onChange,
  onReplace,
  onRemove,
  onRetry,
}: Readonly<{
  recording: GroupRecording;
  asset: MediaAsset | undefined;
  label: string;
  compact: boolean;
  onChange: (recording: GroupRecording) => void;
  onReplace: (asset: MediaAsset | LibraryAsset) => void;
  onRemove?: (() => void) | undefined;
  onRetry: () => void;
}>) {
  const { t, i18n } = useTranslation();
  const [replacing, setReplacing] = useState(false);
  const [open, setOpen] = useState(false);
  if (replacing)
    return (
      <RecordingPicker
        onPick={(next) => {
          setReplacing(false);
          onReplace(next);
        }}
        onCancel={() => setReplacing(false)}
      />
    );
  const name = asset?.originalFilename ?? label;
  const meta = asset
    ? [
        asset.mimeType === "audio/mpeg" ? "MP3" : "M4A",
        ...(asset.durationMs == null ? [] : [audioLength(asset.durationMs)]),
        formatBytes(asset.bytes),
      ].join(" · ")
    : "";
  const rules = (
    <div className="overflow-hidden rounded-[10px] border [&>:first-child]:border-t-0">
      <AudioPolicyPanel
        policy={recording.policy}
        transcript={recording.transcript ?? ""}
        transcriptHint={t("groups.pane.transcriptHint")}
        onPolicyChange={(policy) => onChange({ ...recording, policy })}
        onTranscriptChange={(transcript) => onChange({ ...recording, transcript })}
      />
    </div>
  );
  return (
    <div className={CARD} lang={i18n.language}>
      <div className="flex flex-col gap-3.5 px-4 pt-3.5 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-[9px]">
            <AudioLines aria-hidden="true" className="size-4.25" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span title={name} className="truncate text-sm font-semibold">
              {name}
            </span>
            <span className="text-muted-fg text-[12.5px]">{meta}</span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7.5 shrink-0 rounded-[7px] px-2.5 text-[12.5px] font-medium shadow-none max-[767px]:h-10"
            onClick={() => setReplacing(true)}
          >
            {t("media.replace")}
          </Button>
          {onRemove ? (
            <RowMenu label={t("groups.pane.partMenu")}>
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 aria-hidden="true" />
                {t("groups.pane.removeAudio")}
              </DropdownMenuItem>
            </RowMenu>
          ) : null}
        </div>
        {asset ? (
          <AudioPlayer
            src={asset.url}
            label={label}
            durationMs={asset.durationMs}
            size="sm"
            onRetry={onRetry}
          />
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
            {t("groups.retryAsset")}
          </Button>
        )}
        {compact ? (
          <>
            <button
              type="button"
              aria-expanded={open}
              className="flex min-h-7.5 w-full items-center gap-2 rounded-[7px] text-left text-[13px] max-[767px]:min-h-10"
              onClick={() => setOpen(!open)}
            >
              <SlidersHorizontal
                aria-hidden="true"
                className="text-muted-fg size-3.5 shrink-0"
              />
              <span className="font-medium whitespace-nowrap">
                {t("groups.recordingPolicy")}
              </span>
              <span className="text-muted-fg min-w-0 flex-1 truncate">
                {policySummary(recording.policy, t)}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "text-muted-fg size-3.75 shrink-0 transition-transform motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </button>
            {open ? rules : null}
          </>
        ) : (
          rules
        )}
      </div>
    </div>
  );
}
