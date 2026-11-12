import type { TFunction } from "i18next";
import type { ContentBlock, SemanticContent } from "@/components/shared/content/model";
import { DEFAULT_AUDIO_POLICY } from "@/features/question-bank/audioPolicy";
import type { LibraryAsset, MediaAsset } from "@/features/media/api";
import type { GroupBundle } from "./api";
import { materialAssets, type GroupMaterial, type GroupRecording } from "./model";

type AudioBlock = Extract<ContentBlock, { type: "audio" }>;

const EMPTY_PARAGRAPH: ContentBlock = { type: "paragraph", content: [] };

function isEmptyParagraph(block: ContentBlock): boolean {
  return (
    block.type === "paragraph" &&
    block.content.every((node) => node.type === "text" && node.text.trim() === "")
  );
}

/**
 * leadAudio is the recording a material opens with: its first block when that
 * is an audio block, which the pane draws as the recording's card above the
 * text. A material stored as Markdown has none.
 */
export function leadAudio(material: GroupMaterial): AudioBlock | null {
  if (material.content.format !== "semantic_v1") return null;
  const [first] = material.content.blocks;
  return first?.type === "audio" ? first : null;
}

/** materialText is a material's text: its content without the recording it opens with, never without a paragraph. */
export function materialText(material: GroupMaterial): SemanticContent | null {
  if (material.content.format !== "semantic_v1") return null;
  const blocks = leadAudio(material)
    ? material.content.blocks.slice(1)
    : material.content.blocks;
  return {
    format: "semantic_v1",
    blocks: blocks.length > 0 ? blocks : [EMPTY_PARAGRAPH],
  };
}

/** hasText says whether a material's text holds anything besides empty paragraphs. */
export function hasText(material: GroupMaterial): boolean {
  if (material.content.format !== "semantic_v1")
    return material.content.markdown.trim() !== "";
  return (materialText(material)?.blocks ?? []).some(
    (block) => !isEmptyParagraph(block),
  );
}

function underNothing(blocks: readonly ContentBlock[]): ContentBlock[] {
  return blocks[0]?.type === "audio" ? [EMPTY_PARAGRAPH, ...blocks] : [...blocks];
}

/**
 * withText is the material's content with `text` under the recording it opens
 * with. A text left empty is not kept under a recording. Where the material
 * opens with no recording, a text that begins with one gets an empty
 * paragraph above it, so the recording stays a part of the text and is not
 * taken for the one the material opens with.
 */
export function withText(
  material: GroupMaterial,
  text: SemanticContent,
): SemanticContent {
  const audio = leadAudio(material);
  if (!audio) return { format: "semantic_v1", blocks: underNothing(text.blocks) };
  const blank = text.blocks.every(isEmptyParagraph);
  return { format: "semantic_v1", blocks: blank ? [audio] : [audio, ...text.blocks] };
}

function startingPolicy(asset: MediaAsset | LibraryAsset): GroupRecording["policy"] {
  const stored = "defaultMaxPlays" in asset ? asset.defaultMaxPlays : null;
  if (stored === null) return { ...DEFAULT_AUDIO_POLICY };
  return { ...DEFAULT_AUDIO_POLICY, maxPlays: stored === 0 ? null : stored };
}

/**
 * withRecordings is the bundle with one recording for each audio asset its
 * materials play, in their order: the recording it has for the asset, else
 * one of `known`, else a new one with the default listening rules.
 */
export function withRecordings(
  bundle: GroupBundle,
  known: ReadonlyMap<string, GroupRecording> = new Map(),
): GroupBundle {
  const current = new Map(
    bundle.group.recordings.map((recording) => [recording.assetId, recording]),
  );
  const recordings = [...materialAssets(bundle.group.stimuli)].flatMap(
    ([assetId, kind]) =>
      kind === "audio"
        ? [
            current.get(assetId) ??
              known.get(assetId) ?? {
                id: crypto.randomUUID(),
                assetId,
                policy: { ...DEFAULT_AUDIO_POLICY },
                transcript: null,
              },
          ]
        : [],
  );
  const same =
    recordings.length === bundle.group.recordings.length &&
    recordings.every(
      (recording, index) => recording === bundle.group.recordings[index],
    );
  return same ? bundle : { ...bundle, group: { ...bundle.group, recordings } };
}

/**
 * withLeadRecording puts `asset` at the head of the material `materialId`, in
 * place of the recording it opens with, or makes the group's first material
 * for it when the group has none. A recording replaced by another file lends
 * the new one its listening rules and transcript; a first recording takes a
 * library file's play limit (DG-69).
 */
export function withLeadRecording(
  bundle: GroupBundle,
  materialId: string | null,
  asset: MediaAsset | LibraryAsset,
  label: string,
): GroupBundle {
  const block: AudioBlock = { type: "audio", assetId: asset.id, label };
  const material = bundle.group.stimuli.find((item) => item.id === materialId);
  const previous = material ? leadAudio(material) : null;
  const before = bundle.group.recordings.find(
    (recording) => recording.assetId === previous?.assetId,
  );
  let stimuli: GroupMaterial[];
  if (!material) {
    stimuli = [
      ...bundle.group.stimuli,
      {
        id: crypto.randomUUID(),
        title: bundle.group.title,
        content: { format: "semantic_v1", blocks: [block] },
        gaps: [],
      },
    ];
  } else if (material.content.format !== "semantic_v1") {
    return bundle;
  } else {
    const rest = previous ? material.content.blocks.slice(1) : material.content.blocks;
    const text = rest.every(isEmptyParagraph) ? [] : rest;
    stimuli = bundle.group.stimuli.map((item) =>
      item === material
        ? { ...item, content: { format: "semantic_v1", blocks: [block, ...text] } }
        : item,
    );
  }
  const others = bundle.group.recordings.filter(
    (recording) => recording !== before && recording.assetId !== asset.id,
  );
  const kept = bundle.group.recordings.find(
    (recording) => recording.assetId === asset.id,
  );
  const recording: GroupRecording = kept ?? {
    id: before?.id ?? crypto.randomUUID(),
    assetId: asset.id,
    policy: before ? before.policy : startingPolicy(asset),
    transcript: before?.transcript ?? null,
  };
  return withRecordings({
    ...bundle,
    group: { ...bundle.group, stimuli, recordings: [...others, recording] },
  });
}

/**
 * withoutLeadRecording removes the recording a material opens with, and the
 * material itself when nothing else is in it. The text and every question
 * stay, and a recording the text begins with stays a part of the text.
 */
export function withoutLeadRecording(
  bundle: GroupBundle,
  materialId: string,
): GroupBundle {
  const material = bundle.group.stimuli.find((item) => item.id === materialId);
  if (!material || material.content.format !== "semantic_v1" || !leadAudio(material))
    return bundle;
  const rest = material.content.blocks.slice(1);
  const stimuli = rest.every(isEmptyParagraph)
    ? bundle.group.stimuli.filter((item) => item !== material)
    : bundle.group.stimuli.map((item) =>
        item === material
          ? {
              ...item,
              content: { format: "semantic_v1" as const, blocks: underNothing(rest) },
            }
          : item,
      );
  return withRecordings({ ...bundle, group: { ...bundle.group, stimuli } });
}

/** transcriptText is a transcript as a text: one paragraph for each of its lines that says something. */
export function transcriptText(transcript: string): SemanticContent {
  const blocks: ContentBlock[] = transcript
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line, marks: [] }],
    }));
  return {
    format: "semantic_v1",
    blocks: blocks.length > 0 ? blocks : [EMPTY_PARAGRAPH],
  };
}

/**
 * policySummary says a recording's listening rules in a line: how many times
 * it plays and whether students can pause it.
 */
export function policySummary(policy: GroupRecording["policy"], t: TFunction): string {
  const plays =
    policy.maxPlays === null
      ? t("groups.pane.policyUnlimited")
      : t("groups.pane.policyPlays", { count: policy.maxPlays });
  const pause = t(
    (policy.allowPause ?? true)
      ? "groups.pane.policyPause"
      : "groups.pane.policyNoPause",
  );
  return `${plays} · ${pause}`;
}
