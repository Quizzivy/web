import { useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { t } from "i18next";
import type { SemanticContent } from "@/components/shared/content/model";
import type { MediaAsset } from "@/features/media/api";
import type { GroupBundle } from "@/features/question-groups/api";
import { GroupWorkspace } from "@/features/question-groups/components/GroupWorkspace";
import {
  gapQuestions,
  gapRows,
  withGapAnswer,
  withMaterialContent,
  type GapPrompts,
} from "@/features/question-groups/gapQuestions";
import { startBundle, type GroupStart } from "@/features/question-groups/kinds";
import { withLeadRecording } from "@/features/question-groups/materialParts";
import {
  newGroupQuestion,
  withMembers,
  type GroupQuestion,
} from "@/features/question-groups/model";
import { AddButtons } from "@/features/tests/components/AddButtons";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const prompts: GapPrompts = {
  typed: t("groups.pane.gapPromptTyped"),
  choice: t("groups.pane.gapPromptChoice"),
  defaults: new Set([
    t("groups.pane.gapPromptTyped"),
    t("groups.pane.gapPromptChoice"),
  ]),
};

const RECORDING: MediaAsset = {
  id: "8a0f6f0e-5b0a-4f52-9c7e-3f6f1f1f0a01",
  kind: "audio",
  url: "data:audio/mpeg;base64,",
  mimeType: "audio/mpeg",
  bytes: 2_202_009,
  durationMs: 134_000,
  originalFilename: "part-1-asking-the-way.mp3",
  createdAt: "2026-11-12T03:00:00Z",
};

function paragraphs(...texts: string[]): SemanticContent {
  return {
    format: "semantic_v1",
    blocks: texts.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text, marks: [] }],
    })),
  };
}

function gapped(
  runs: string[],
  words: string[],
): { content: SemanticContent; words: Map<string, string> } {
  const made = new Map<string, string>();
  const content: SemanticContent = {
    format: "semantic_v1",
    blocks: [
      {
        type: "paragraph",
        content: runs.flatMap((run, index) => {
          const word = words[index];
          const text = { type: "text" as const, text: run, marks: [] };
          if (word === undefined) return [text];
          const id = `00000000-0000-4000-8000-00000000000${index + 1}`;
          made.set(id, word);
          return [text, { type: "gap" as const, id, label: String(index + 1) }];
        }),
      },
    ],
  };
  return { content, words: made };
}

function titled(
  bundle: GroupBundle,
  title: string,
  text: SemanticContent,
): GroupBundle {
  return {
    ...bundle,
    group: {
      ...bundle.group,
      title,
      stimuli: bundle.group.stimuli.map((item) => ({ ...item, title, content: text })),
    },
  };
}

function reading(): GroupBundle {
  const base = titled(
    startBundle("reading", t),
    "Why cities need green space",
    paragraphs(
      "Cities that plant trees along their streets see cooler summers and more people walking. Public parks also raise the value of the homes around them, which is one reason councils now protect them.",
      "In several cities, streets are closed to cars on Sundays so that families can use them as play streets.",
    ),
  );
  const prompt = (text: string): GroupQuestion => {
    const question = newGroupQuestion(t);
    return {
      ...question,
      input: {
        ...question.input,
        prompt: text,
        promptContent: paragraphs(text) as NonNullable<
          GroupQuestion["input"]["promptContent"]
        >,
        options: [
          { text: "Cities should build more roads.", isCorrect: false },
          { text: "Green space makes a city a better place to live.", isCorrect: true },
          { text: "Parks cost too much to keep.", isCorrect: false },
          { text: "Trees damage the streets.", isCorrect: false },
        ],
      },
    };
  };
  return withMembers(base, [
    prompt("What is the writer’s main point?"),
    prompt("True or False: parks lower the value of nearby homes."),
    prompt("What does the writer call streets closed to cars?"),
    prompt("Which benefits of trees does the passage mention?"),
  ]);
}

function cloze(): GroupBundle {
  const start = startBundle("cloze", t);
  const { content, words } = gapped(
    [
      "Green spaces matter in big cities. Parks give people a place to ",
      " after work. Trees also ",
      " the air cleaner. Many cities now ",
      " roofs with plants, and some streets are closed to cars on Sundays.",
    ],
    ["relax", "make", "cover"],
  );
  let bundle = titled(
    start,
    "Green spaces in big cities",
    start.group.stimuli[0]!.content as SemanticContent,
  );
  bundle = withMaterialContent(bundle, bundle.group.stimuli[0]!.id, content, {
    words,
    restore: new Map(),
    prompts,
  }).bundle;
  const wrong = [
    ["relaxing", "relaxed", "relaxes"],
    ["do", "take", "have"],
  ];
  wrong.forEach((options, index) => {
    const gap = [...gapQuestions(bundle).values()][index]!;
    const rows = gapRows(bundle, gap).map((row) => ({ ...row }));
    let next = 0;
    for (const row of rows) if (!row.isCorrect) row.text = options[next++] ?? "";
    bundle = withGapAnswer(
      bundle,
      gap,
      { rows, also: [], prompt: gap.prompt },
      prompts,
    );
  });
  return bundle;
}

function listening(text: boolean): GroupBundle {
  let bundle = withLeadRecording(
    {
      ...startBundle("listening", t),
      group: { ...startBundle("listening", t).group, title: "Asking the way" },
    },
    null,
    RECORDING,
    t("groups.audio"),
  );
  bundle = {
    ...bundle,
    group: {
      ...bundle.group,
      recordings: bundle.group.recordings.map((recording) => ({
        ...recording,
        transcript:
          "Excuse me, how do I get to the post office? Go straight on, then turn left at the bank. It’s opposite the park.",
      })),
    },
  };
  if (!text) return withMembers(bundle, [newGroupQuestion(t), newGroupQuestion(t)]);
  const material = bundle.group.stimuli[0]!;
  const { content, words } = gapped(
    [
      "Excuse me, how do I get to the ",
      "? Go straight on, then turn ",
      " at the bank. It’s ",
      " the park.",
    ],
    ["post office", "left", "opposite"],
  );
  return withMaterialContent(
    bundle,
    material.id,
    {
      format: "semantic_v1",
      blocks: [
        material.content.format === "semantic_v1"
          ? material.content.blocks[0]!
          : content.blocks[0]!,
        ...content.blocks,
      ],
    },
    { words, restore: new Map(), prompts },
  ).bundle;
}

function pane(initial: GroupBundle, start?: GroupStart, open?: number) {
  return function Pane() {
    const [bundle, setBundle] = useState(initial);
    const [selected, setSelected] = useState<string | null>(
      open === undefined ? null : (initial.group.members[open]?.questionId ?? null),
    );
    return (
      <QueryClientProvider client={client}>
        <GroupWorkspace
          bundle={bundle}
          assets={[RECORDING]}
          start={start}
          section="Phần 2"
          firstNumber={5}
          selectedQuestionId={selected ?? undefined}
          onSelectedQuestionChange={setSelected}
          onChange={setBundle}
          onAsset={() => undefined}
          onRefresh={() => undefined}
        />
      </QueryClientProvider>
    );
  };
}

export const cases: Record<string, () => ReactElement> = {
  "reading-empty": pane(startBundle("reading", t), "reading"),
  reading: pane(reading(), undefined, 0),
  "cloze-empty": pane(startBundle("cloze", t), "cloze"),
  cloze: pane(cloze(), undefined, 2),
  "listening-empty": pane(startBundle("listening", t), "listening"),
  listening: pane(listening(false), undefined, 0),
  "listening-cloze": pane(listening(true), undefined, 0),
  add: () => (
    <div className="bg-card flex w-67 flex-col gap-0.5 rounded-xl border p-2">
      <AddButtons
        disabled={false}
        target="Phần 2"
        onCreateQuestion={() => undefined}
        onCreateGroup={() => undefined}
      />
    </div>
  ),
};
