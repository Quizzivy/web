import { expect, test } from "vitest";
import { t } from "i18next";
import "@/lib/i18n";
import type { SemanticContent } from "@/components/shared/content/model";
import type { GroupBundle } from "@/features/question-groups/api";
import {
  GAP_ROWS,
  gapQuestions,
  gapRow,
  gapRows,
  gapSentence,
  unfinishedMember,
  withGapAnswer,
  withMaterialContent,
  type GapPrompts,
  type RemovedGap,
} from "@/features/question-groups/gapQuestions";
import { groupKind, startBundle } from "@/features/question-groups/kinds";
import {
  groupIssue,
  newGroupQuestion,
  withMembers,
} from "@/features/question-groups/model";

const prompts: GapPrompts = {
  typed: "Type the right word for this gap.",
  choice: "Choose the right word for this gap.",
  defaults: new Set([
    "Type the right word for this gap.",
    "Choose the right word for this gap.",
  ]),
};

function text(...parts: Array<string | { gap: string }>): SemanticContent {
  return {
    format: "semantic_v1",
    blocks: [
      {
        type: "paragraph",
        content: parts.map((part, index) =>
          typeof part === "string"
            ? { type: "text" as const, text: part, marks: [] }
            : { type: "gap" as const, id: part.gap, label: String(index) },
        ),
      },
    ],
  };
}

function cloze(): GroupBundle {
  return startBundle("cloze", t);
}

function make(
  bundle: GroupBundle,
  content: SemanticContent,
  words: Record<string, string>,
  restore: ReadonlyMap<string, RemovedGap> = new Map(),
) {
  return withMaterialContent(bundle, bundle.group.stimuli[0]!.id, content, {
    words: new Map(Object.entries(words)),
    restore,
    prompts,
  });
}

test("a gap made from a word is a typed question that saves at once", () => {
  const made = make(
    cloze(),
    text("Parks give people a place to ", { gap: "g1" }, "."),
    {
      g1: "relax",
    },
  );
  const [question] = made.bundle.questions;
  expect(made.made).toEqual([question!.id]);
  expect(question!.input.type).toBe("fill_blank");
  expect(question!.input.blanks?.[0]?.acceptedAnswers).toEqual(["relax"]);
  expect(question!.input.points).toBe(1);
  expect(made.bundle.group.stimuli[0]!.gaps).toEqual([
    {
      kind: "blank",
      gapId: "g1",
      questionId: question!.id,
      blankGapId: question!.input.blanks?.[0]?.gapId,
    },
  ]);
  expect(groupIssue(made.bundle)).toBeNull();
  expect(gapQuestions(made.bundle).get(question!.id)).toMatchObject({
    mode: "typed",
    word: "relax",
    prompt: prompts.typed,
  });
});

test("the first wrong option makes the gap a choice, and clearing the last makes it typed again", () => {
  const typed = make(cloze(), text("Trees ", { gap: "g1" }, " the air cleaner."), {
    g1: "make",
  }).bundle;
  const gap = [...gapQuestions(typed).values()][0]!;
  const rows = gapRows(typed, gap);
  expect(rows).toHaveLength(GAP_ROWS);
  expect(rows[gapRow("g1")]).toEqual({ text: "make", isCorrect: true });

  const wrongAt = (gapRow("g1") + 1) % GAP_ROWS;
  const filled = rows.map((row, index) =>
    index === wrongAt ? { text: "do", isCorrect: false } : row,
  );
  const chosen = withGapAnswer(
    typed,
    gap,
    { rows: filled, also: [], prompt: gap.prompt },
    prompts,
  );
  const question = chosen.questions[0]!;
  expect(question.id).toBe(gap.questionId);
  expect(question.input.type).toBe("single_choice");
  expect(question.input.prompt).toBe(prompts.choice);
  expect(
    question.input.options?.map((option) => [option.text, option.isCorrect]),
  ).toEqual(
    wrongAt < gapRow("g1")
      ? [
          ["do", false],
          ["make", true],
        ]
      : [
          ["make", true],
          ["do", false],
        ],
  );
  expect(chosen.group.stimuli[0]!.gaps).toEqual([
    { kind: "question", gapId: "g1", questionId: gap.questionId },
  ]);
  expect(groupIssue(chosen)).toBeNull();

  const again = gapQuestions(chosen).get(gap.questionId)!;
  const cleared = withGapAnswer(
    chosen,
    again,
    { rows, also: ["makes"], prompt: again.prompt },
    prompts,
  );
  expect(cleared.questions[0]!.input.type).toBe("fill_blank");
  expect(cleared.questions[0]!.input.prompt).toContain(prompts.typed);
  expect(cleared.questions[0]!.input.blanks?.[0]?.acceptedAnswers).toEqual([
    "make",
    "makes",
  ]);
  expect(cleared.group.stimuli[0]!.gaps[0]?.kind).toBe("blank");
  expect(groupIssue(cleared)).toBeNull();
});

test("a prompt the teacher wrote survives a change of mode", () => {
  const typed = make(cloze(), text({ gap: "g1" }, " roofs"), { g1: "cover" }).bundle;
  const gap = [...gapQuestions(typed).values()][0]!;
  const rows = [
    { text: "cover", isCorrect: true },
    { text: "covers", isCorrect: false },
  ];
  const chosen = withGapAnswer(
    typed,
    gap,
    { rows, also: [], prompt: "Pick the verb." },
    prompts,
  );
  expect(chosen.questions[0]!.input.prompt).toBe("Pick the verb.");
});

test("gap questions follow the order of the gaps and leave other questions in place", () => {
  const start = withMembers(cloze(), [newGroupQuestion(t)]);
  const ordinary = start.questions[0]!.id;
  const first = make(start, text("a ", { gap: "late" }, " b"), { late: "two" }).bundle;
  const second = make(first, text({ gap: "early" }, " a ", { gap: "late" }, " b"), {
    early: "one",
  }).bundle;
  const words = second.group.members.map(
    (member) =>
      gapQuestions(second).get(member.questionId)?.word ??
      (member.questionId === ordinary ? "ordinary" : "?"),
  );
  expect(words).toEqual(["ordinary", "one", "two"]);
  expect(second.questions.map((question) => question.id)).toEqual(
    second.group.members.map((member) => member.questionId),
  );
});

test("a gap that leaves the text takes its question, and undoing brings both back", () => {
  const withGap = make(cloze(), text("a ", { gap: "g1" }, " b"), { g1: "word" }).bundle;
  const gone = make(withGap, text("a word b"), {});
  expect(gone.bundle.questions).toEqual([]);
  expect(gone.bundle.group.members).toEqual([]);
  expect(gone.bundle.group.stimuli[0]!.gaps).toEqual([]);
  expect(gone.removed).toHaveLength(1);

  const memory = new Map(gone.removed.map((item) => [item.binding.gapId, item]));
  const back = make(gone.bundle, text("a ", { gap: "g1" }, " b"), {}, memory);
  expect(back.made).toEqual([]);
  expect(back.bundle.questions).toEqual(withGap.questions);
  expect(back.bundle.group.stimuli[0]!.gaps).toEqual(withGap.group.stimuli[0]!.gaps);
});

function ordinary(): { bound: GroupBundle; questionId: string } {
  const start = withMembers(cloze(), [newGroupQuestion(t)]);
  const questionId = start.questions[0]!.id;
  const material = start.group.stimuli[0]!;
  const bound: GroupBundle = {
    ...start,
    questions: start.questions.map((question) => ({
      ...question,
      input: { ...question.input, type: "multiple_choice" as const },
    })),
    group: {
      ...start.group,
      stimuli: [
        {
          ...material,
          content: text("a ", { gap: "g1" }),
          gaps: [{ kind: "question", gapId: "g1", questionId }],
        },
      ],
    },
  };
  return { bound, questionId };
}

test("an ordinary question a gap pointed at stays when the gap goes", () => {
  const { bound, questionId } = ordinary();
  expect(gapQuestions(bound).size).toBe(0);
  const gone = make(bound, text("a"), {});
  expect(gone.removed).toEqual([]);
  expect(gone.unbound).toEqual([{ kind: "question", gapId: "g1", questionId }]);
  expect(gone.bundle.questions.map((question) => question.id)).toEqual([questionId]);
});

test("undoing brings a gap back to the ordinary question it pointed at, while that still stands", () => {
  const { bound, questionId } = ordinary();
  const gone = make(bound, text("a"), {});
  const context = {
    words: new Map<string, string>(),
    restore: new Map<string, RemovedGap>(),
    bindings: new Map(gone.unbound.map((item) => [item.gapId, item])),
    prompts,
  };
  const materialId = bound.group.stimuli[0]!.id;

  const back = withMaterialContent(
    gone.bundle,
    materialId,
    text("a ", { gap: "g1" }),
    context,
  );
  expect(back.made).toEqual([]);
  expect(back.bundle.questions.map((question) => question.id)).toEqual([questionId]);
  expect(back.bundle.group.stimuli[0]!.gaps).toEqual([
    { kind: "question", gapId: "g1", questionId },
  ]);

  const emptied: GroupBundle = {
    ...gone.bundle,
    questions: [],
    group: { ...gone.bundle.group, members: [] },
  };
  const fresh = withMaterialContent(
    emptied,
    materialId,
    text("a ", { gap: "g1" }),
    context,
  );
  expect(fresh.made).toHaveLength(1);
  expect(fresh.bundle.group.stimuli[0]!.gaps[0]!.kind).toBe("blank");

  const twice = withMaterialContent(
    back.bundle,
    materialId,
    text("a ", { gap: "g1" }, " b ", { gap: "g2" }),
    { ...context, bindings: new Map([["g2", gone.unbound[0]!]]) },
  );
  expect(twice.made).toHaveLength(1);
  expect(twice.bundle.group.stimuli[0]!.gaps.map((gap) => gap.questionId)).toEqual([
    questionId,
    twice.made[0],
  ]);
});

test("the word's row is one of four and differs between gaps", () => {
  const rows = new Set(Array.from({ length: 64 }, () => gapRow(crypto.randomUUID())));
  expect([...rows].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  expect(gapRow("g1")).toBe(gapRow("g1"));
});

test("a group is named for what it holds", () => {
  expect(groupKind(startBundle("reading", t), "reading")).toBe("reading");
  expect(groupKind(startBundle("cloze", t), "cloze")).toBe("cloze");
  expect(groupKind(startBundle("cloze", t))).toBe("reading");
  expect(groupKind(startBundle("listening", t), "listening")).toBe("listening");

  const gapsOnly = make(cloze(), text({ gap: "g1" }), { g1: "x" }).bundle;
  expect(groupKind(gapsOnly)).toBe("cloze");
  expect(groupKind(withMembers(gapsOnly, [newGroupQuestion(t)]))).toBe("reading");
  expect(
    groupKind({
      ...gapsOnly,
      group: {
        ...gapsOnly.group,
        recordings: [
          {
            id: crypto.randomUUID(),
            assetId: crypto.randomUUID(),
            policy: { maxPlays: 2, allowSeek: false, showTranscriptAfterSubmit: false },
          },
        ],
      },
    }),
  ).toBe("listening");
});

test("the unfinished member is named with what it lacks", () => {
  const complete = withMembers(cloze(), [newGroupQuestion(t), newGroupQuestion(t)]);
  expect(unfinishedMember(complete)).toBeNull();
  const second = complete.questions[1]!;
  const broken: GroupBundle = {
    ...complete,
    questions: [
      complete.questions[0]!,
      {
        ...second,
        input: {
          ...second.input,
          options: [
            { text: "A", isCorrect: true },
            { text: "", isCorrect: false },
          ],
        },
      },
    ],
  };
  expect(unfinishedMember(broken)).toEqual({
    questionId: second.id,
    issue: "questionEditor.errors.optionRequired",
  });
});

test("a gap's sentence is cut at the sentences around it", () => {
  const content = text(
    "Green spaces matter. Parks give people a place to ",
    { gap: "g1" },
    " after work. Trees also ",
    { gap: "g2" },
    " the air cleaner",
  );
  const word = (id: string) => (id === "g1" ? "relax" : "make");
  expect(gapSentence(content, "g1", word)).toEqual({
    before: "… Parks give people a place to ",
    after: " after work.",
  });
  expect(gapSentence(content, "g2", word)).toEqual({
    before: "… Trees also ",
    after: " the air cleaner …",
  });
  expect(gapSentence(content, "missing", word)).toBeNull();
});
