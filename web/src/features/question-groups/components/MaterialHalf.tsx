import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import {
  AudioLines,
  Captions,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  Text,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RowMenu } from "@/components/shared/RowMenu";
import type { SemanticContent } from "@/components/shared/content/model";
import { cn } from "@/lib/utils";
import type { LibraryAsset, MediaAsset } from "@/features/media/api";
import { AudioPolicyPanel } from "@/features/question-bank/components/AudioPolicyPanel";
import { materialText, policySummary } from "../materialParts";
import type { GroupMaterial, GroupRecording } from "../model";
import type { MaterialView } from "../paneView";
import { MaterialText } from "./MaterialText";
import { RecordingCard, RecordingPicker } from "./RecordingCard";

const EMPTY_TEXT: SemanticContent = {
  format: "semantic_v1",
  blocks: [{ type: "paragraph", content: [] }],
};
const CHIP =
  "bg-card h-7.5 gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium shadow-none max-[767px]:h-10 [&_svg]:text-muted-fg";

/**
 * MaterialActions are what the left half asks of the pane.
 */
export interface MaterialActions {
  selectMaterial: (id: string) => void;
  renameMaterial: (id: string, title: string) => void;
  changeMaterial: (material: GroupMaterial) => void;
  changeRecording: (recording: GroupRecording) => void;
  attach: (asset: MediaAsset | LibraryAsset) => void;
  askRemoveRecording: () => void;
  askRemoveText: () => void;
  showPicker: (shown: boolean) => void;
  openText: () => void;
  copyTranscript: () => void;
  changeText: (text: SemanticContent) => void;
  takeEditor: (editor: Editor | null) => void;
  makeGap: (editor: Editor) => void;
  onAsset: (asset: MediaAsset) => void;
  onRefresh: () => void;
}

/**
 * MaterialHalf is the left half of a group's pane: the recording's card, or
 * the picker for one, or the row that adds one; then the text, or what adds
 * one under a recording. A group of several materials, made in the pane this
 * one replaced, lists them above as buttons, each with its own title.
 * `textKey` remounts the text's editor when the pane replaces the text
 * itself; `steps` are drawn under an empty cloze.
 */
export function MaterialHalf({
  hidden,
  label,
  stimuli,
  material,
  view,
  assets,
  textKey,
  placeholder,
  steps,
  actions,
}: Readonly<{
  hidden: boolean;
  label: string;
  stimuli: readonly GroupMaterial[];
  material: GroupMaterial | null;
  view: MaterialView;
  assets: ReadonlyMap<string, MediaAsset>;
  textKey: string;
  placeholder: string;
  steps: ReactNode;
  actions: MaterialActions;
}>) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={label}
      hidden={hidden}
      className={cn(
        "min-w-0 flex-1 basis-0 flex-col gap-3",
        hidden ? "hidden" : "flex",
      )}
    >
      {stimuli.length > 1 && material ? (
        <MaterialPicker
          label={label}
          stimuli={stimuli}
          material={material}
          actions={actions}
        />
      ) : null}
      <RecordingPart view={view} assets={assets} actions={actions} />
      <TextPart
        material={material}
        view={view}
        textKey={textKey}
        placeholder={placeholder}
        steps={steps}
        actions={actions}
      />
      {view.others.map((item) => (
        <OtherRecording
          key={item.id}
          recording={item}
          name={assets.get(item.assetId)?.originalFilename ?? t("groups.audio")}
          onChange={actions.changeRecording}
        />
      ))}
    </section>
  );
}

function MaterialPicker({
  label,
  stimuli,
  material,
  actions,
}: Readonly<{
  label: string;
  stimuli: readonly GroupMaterial[];
  material: GroupMaterial;
  actions: MaterialActions;
}>) {
  const { t } = useTranslation();
  return (
    <>
      <div
        role="group"
        aria-label={label}
        className="bg-muted flex flex-wrap gap-0.5 rounded-[9px] p-0.75"
      >
        {stimuli.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === material.id}
            className={cn(
              "h-7.5 max-w-48 truncate rounded-[7px] px-2.5 text-[12.5px] font-medium max-[767px]:h-10",
              item.id === material.id ? "bg-card text-fg shadow-card" : "text-muted-fg",
            )}
            onClick={() => actions.selectMaterial(item.id)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor={`material-title-${material.id}`}>
          {t("groups.titleLabel")}
        </FieldLabel>
        <Input
          id={`material-title-${material.id}`}
          value={material.title}
          maxLength={200}
          onChange={(event) => actions.renameMaterial(material.id, event.target.value)}
        />
      </Field>
    </>
  );
}

function RecordingPart({
  view,
  assets,
  actions,
}: Readonly<{
  view: MaterialView;
  assets: ReadonlyMap<string, MediaAsset>;
  actions: MaterialActions;
}>) {
  const { t } = useTranslation();
  if (view.audio && view.recording)
    return (
      <RecordingCard
        key={view.recording.id}
        recording={view.recording}
        asset={assets.get(view.recording.assetId)}
        label={view.audio.label}
        compact={view.textShown}
        onChange={actions.changeRecording}
        onReplace={actions.attach}
        onRemove={actions.askRemoveRecording}
        onRetry={actions.onRefresh}
      />
    );
  if (view.pickerShown)
    return (
      <RecordingPicker
        onPick={actions.attach}
        onCancel={view.pickerStays ? undefined : () => actions.showPicker(false)}
      />
    );
  if (view.legacy) return null;
  return (
    <PartRow
      icon={AudioLines}
      label={t("groups.pane.addAudio")}
      hint={t("groups.pane.addAudioHint")}
      onClick={() => actions.showPicker(true)}
    />
  );
}

function TextPart({
  material,
  view,
  textKey,
  placeholder,
  steps,
  actions,
}: Readonly<{
  material: GroupMaterial | null;
  view: MaterialView;
  textKey: string;
  placeholder: string;
  steps: ReactNode;
  actions: MaterialActions;
}>) {
  const { t } = useTranslation();
  if (!view.textShown) return <AddText view={view} actions={actions} />;
  if (view.legacy && material)
    return <LegacyText material={material} onChange={actions.changeMaterial} />;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {view.audio ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold">
            {t("groups.pane.textLabel")}
          </span>
          <RowMenu label={t("groups.pane.partMenu")}>
            <DropdownMenuItem variant="destructive" onSelect={actions.askRemoveText}>
              <Trash2 aria-hidden="true" />
              {t("groups.pane.removeText")}
            </DropdownMenuItem>
          </RowMenu>
        </div>
      ) : null}
      <MaterialText
        key={textKey}
        text={(material && materialText(material)) ?? EMPTY_TEXT}
        label={t("groups.pane.textLabel")}
        placeholder={placeholder}
        gaps={view.gaps}
        onText={actions.changeText}
        onEditor={actions.takeEditor}
        onAsset={actions.onAsset}
        onMakeGap={actions.makeGap}
      >
        {steps}
      </MaterialText>
    </div>
  );
}

function AddText({
  view,
  actions,
}: Readonly<{ view: MaterialView; actions: MaterialActions }>) {
  const { t } = useTranslation();
  if (!view.recording)
    return (
      <PartRow
        icon={Text}
        label={t("groups.pane.addText")}
        hint={t("groups.pane.addTextShort")}
        onClick={actions.openText}
      />
    );
  return (
    <div className="bg-muted flex flex-col gap-2 rounded-xl px-3.5 py-3">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold">
        <Text aria-hidden="true" className="size-3.5" />
        {t("groups.pane.addText")}
      </span>
      <span className="text-muted-fg text-[12.5px] leading-normal text-pretty">
        {t("groups.pane.addTextHint")}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          className={CHIP}
          onClick={actions.openText}
        >
          <Plus aria-hidden="true" />
          {t("groups.pane.addTextBlank")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={CHIP}
          disabled={(view.recording.transcript ?? "").trim() === ""}
          onClick={actions.copyTranscript}
        >
          <Captions aria-hidden="true" />
          {t("groups.pane.addTextFromTranscript")}
        </Button>
      </div>
    </div>
  );
}

function PartRow({
  icon: Icon,
  label,
  hint,
  onClick,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      className="border-ring hover:bg-hover flex min-h-9 w-full items-center gap-2 rounded-[10px] border border-dashed px-3 py-1.5 text-left text-[12.5px] font-medium transition-colors motion-reduce:transition-none max-[767px]:min-h-11"
      onClick={onClick}
    >
      <Plus aria-hidden="true" className="text-muted-fg size-3.5 flex-none" />
      <Icon aria-hidden="true" className="size-3.5 flex-none" />
      <span className="whitespace-nowrap">{label}</span>
      <span className="text-muted-fg min-w-0 flex-1 truncate font-normal">{hint}</span>
    </button>
  );
}

function OtherRecording({
  recording,
  name,
  onChange,
}: Readonly<{
  recording: GroupRecording;
  name: string;
  onChange: (recording: GroupRecording) => void;
}>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card shadow-card overflow-hidden rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-10 w-full items-center gap-2 px-3.5 text-left text-[13px] max-[767px]:min-h-11"
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal
          aria-hidden="true"
          className="text-muted-fg size-3.5 flex-none"
        />
        <span className="min-w-0 truncate font-medium">{name}</span>
        <span className="text-muted-fg min-w-0 flex-1 truncate">
          {policySummary(recording.policy, t)}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("text-muted-fg size-3.75 flex-none", open && "rotate-180")}
        />
      </button>
      {open ? (
        <AudioPolicyPanel
          policy={recording.policy}
          transcript={recording.transcript ?? ""}
          transcriptHint={t("groups.pane.transcriptHint")}
          onPolicyChange={(policy) => onChange({ ...recording, policy })}
          onTranscriptChange={(transcript) => onChange({ ...recording, transcript })}
        />
      ) : null}
    </div>
  );
}

function LegacyText({
  material,
  onChange,
}: Readonly<{
  material: GroupMaterial;
  onChange: (material: GroupMaterial) => void;
}>) {
  const { t } = useTranslation();
  if (material.content.format !== "legacy_markdown_v1") return null;
  return (
    <Field>
      <FieldLabel htmlFor={`legacy-material-${material.id}`}>
        {t("groups.pane.textLabel")}
      </FieldLabel>
      <Textarea
        id={`legacy-material-${material.id}`}
        value={material.content.markdown}
        maxLength={100_000}
        className="min-h-64"
        onChange={(event) =>
          onChange({
            ...material,
            content: { format: "legacy_markdown_v1", markdown: event.target.value },
          })
        }
      />
      <FieldDescription>{t("groups.legacyMaterial")}</FieldDescription>
    </Field>
  );
}
