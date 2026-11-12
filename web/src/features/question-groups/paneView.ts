import type { ContentBlock } from "@/components/shared/content/model";
import type { GroupBundle } from "./api";
import type { GapQuestion } from "./gapQuestions";
import type { GroupStart } from "./kinds";
import { hasText, leadAudio } from "./materialParts";
import { materialAssets, type GroupMaterial, type GroupRecording } from "./model";

type AudioBlock = Extract<ContentBlock, { type: "audio" }>;

/** GapCounts are a text's gaps by how they are answered, for its footer. */
export interface GapCounts {
  choice: number;
  typed: number;
}

/**
 * MaterialView is what the pane's left half shows of the material in front:
 * the recording it opens with, the other recordings its text plays, whether
 * its text and the recording picker are on screen, whether the picker can be
 * closed, and its gaps by how they are answered.
 */
export interface MaterialView {
  audio: AudioBlock | null;
  recording: GroupRecording | undefined;
  others: GroupRecording[];
  legacy: boolean;
  textShown: boolean;
  pickerShown: boolean;
  pickerStays: boolean;
  gaps: GapCounts;
}

function gapCounts(
  material: GroupMaterial | null,
  gaps: ReadonlyMap<string, GapQuestion>,
): GapCounts {
  const counts = { choice: 0, typed: 0 };
  for (const binding of material?.gaps ?? []) {
    const mode = gaps.get(binding.questionId)?.mode;
    if (mode === "typed" || (mode === undefined && binding.kind === "blank"))
      counts.typed += 1;
    else counts.choice += 1;
  }
  return counts;
}

function showsText(
  material: GroupMaterial | null,
  audio: AudioBlock | null,
  textOpen: boolean,
): boolean {
  if (material === null || textOpen) return textOpen;
  return (
    material.content.format !== "semantic_v1" || hasText(material) || audio === null
  );
}

/**
 * materialView reads what the left half shows of `material`. `flags` are the
 * pane's own: how the group was started, and whether the teacher opened an
 * empty text or the recording picker. A group started from a recording keeps
 * the picker until a file is chosen.
 */
export function materialView(
  bundle: GroupBundle,
  material: GroupMaterial | null,
  gaps: ReadonlyMap<string, GapQuestion>,
  flags: { start: GroupStart | undefined; textOpen: boolean; picking: boolean },
): MaterialView {
  const audio = material ? leadAudio(material) : null;
  const recording = bundle.group.recordings.find(
    (item) => item.assetId === audio?.assetId,
  );
  const played = material ? materialAssets([material]) : new Map<string, string>();
  const fromRecording = flags.start === "listening" || flags.start === "listeningCloze";
  return {
    audio,
    recording,
    others: bundle.group.recordings.filter(
      (item) => item !== recording && played.get(item.assetId) === "audio",
    ),
    legacy: material?.content.format === "legacy_markdown_v1",
    textShown: showsText(material, audio, flags.textOpen),
    pickerShown: audio === null && (flags.picking || fromRecording),
    pickerStays: fromRecording,
    gaps: gapCounts(material, gaps),
  };
}
