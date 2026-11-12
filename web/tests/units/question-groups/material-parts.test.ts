import { expect, test } from "vitest";
import { t } from "i18next";
import "@/lib/i18n";
import type { ContentBlock } from "@/components/shared/content/model";
import { DEFAULT_AUDIO_POLICY } from "@/features/question-bank/audioPolicy";
import type { GroupBundle } from "@/features/question-groups/api";
import { startBundle } from "@/features/question-groups/kinds";
import {
  leadAudio,
  materialText,
  withText,
  withoutLeadRecording,
} from "@/features/question-groups/materialParts";
import type { GroupMaterial } from "@/features/question-groups/model";

const LEAD = "018f0000-0000-7000-8000-0000000007a1";
const INSIDE = "018f0000-0000-7000-8000-0000000007a2";

function audio(assetId: string): ContentBlock {
  return { type: "audio", assetId, label: "Recording" };
}

function paragraph(words: string): ContentBlock {
  return { type: "paragraph", content: [{ type: "text", text: words, marks: [] }] };
}

function material(blocks: ContentBlock[]): GroupMaterial {
  return {
    id: "018f0000-0000-7000-8000-0000000007b1",
    title: "Passage",
    content: { format: "semantic_v1", blocks },
    gaps: [],
  };
}

function audios(blocks: readonly ContentBlock[]): number {
  return blocks.filter((block) => block.type === "audio").length;
}

test("a text is written under the recording the material opens with, and an empty one is not kept", () => {
  const before = material([audio(LEAD), paragraph("Old words.")]);
  expect(
    withText(before, { format: "semantic_v1", blocks: [paragraph("New words.")] })
      .blocks,
  ).toEqual([audio(LEAD), paragraph("New words.")]);
  expect(
    withText(before, { format: "semantic_v1", blocks: [paragraph(" ")] }).blocks,
  ).toEqual([audio(LEAD)]);
});

test("a recording the text begins with stays a part of the text and is written once", () => {
  const before = material([paragraph("Read this.")]);
  const typed = {
    format: "semantic_v1" as const,
    blocks: [audio(INSIDE), paragraph("Read this.")],
  };
  const first = { ...before, content: withText(before, typed) };
  expect(leadAudio(first)).toBeNull();
  expect(audios(first.content.blocks)).toBe(1);
  expect(materialText(first)?.blocks.at(-1)).toEqual(paragraph("Read this."));

  const again = withText(first, {
    format: "semantic_v1",
    blocks: [audio(INSIDE), paragraph("Read this again.")],
  });
  expect(leadAudio({ ...first, content: again })).toBeNull();
  expect(audios(again.blocks)).toBe(1);
});

test("removing the recording a material opens with leaves the text's own recording in the text", () => {
  const start = startBundle("reading", t);
  const held = material([audio(LEAD), audio(INSIDE), paragraph("Read this.")]);
  const bundle: GroupBundle = {
    ...start,
    group: {
      ...start.group,
      stimuli: [held],
      recordings: [LEAD, INSIDE].map((assetId, index) => ({
        id: `018f0000-0000-7000-8000-0000000007c${index}`,
        assetId,
        policy: { ...DEFAULT_AUDIO_POLICY },
        transcript: null,
      })),
    },
  };
  const next = withoutLeadRecording(bundle, held.id);
  const [left] = next.group.stimuli;
  expect(leadAudio(left!)).toBeNull();
  expect(
    audios(left!.content.format === "semantic_v1" ? left!.content.blocks : []),
  ).toBe(1);
  expect(next.group.recordings.map((recording) => recording.assetId)).toEqual([INSIDE]);
});
