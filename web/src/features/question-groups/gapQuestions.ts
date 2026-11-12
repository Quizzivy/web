import type {
  ContentBlock,
  ContentInline,
  SemanticContent,
} from "@/components/shared/content/model";
import { questionGaps } from "@/components/shared/content/gaps";
import { contentPlainText } from "@/components/shared/content/plainText";
import { questionSchema } from "@/features/question-bank/questionSchema";
import type { GroupBundle } from "./api";
import {
  memberOptionOrder,
  memberValues,
  type GroupGapBinding,
  type GroupMaterial,
  type GroupQuestion,
} from "./model";

type Input = GroupQuestion["input"];
type Member = GroupBundle["group"]["members"][number];
type Option = NonNullable<Input["options"]>[number];

/**
 * GapPrompts are the prompts a gap's question starts with, in the teacher's
 * language, and `defaults`, every such prompt in every language: a prompt
 * still among them follows the gap when it changes from typed to chosen.
 */
export interface GapPrompts {
  typed: string;
  choice: string;
  defaults: ReadonlySet<string>;
}

/**
 * GapQuestion is a member that answers one gap and nothing else, in the two
 * shapes the pane makes: `typed`, a fill-in question whose one blank accepts
 * `word` and `also`, and `choice`, a single-choice question whose correct
 * option is `word` and whose others are `wrong`. `prompt` is its prompt
 * without the blank.
 */
export interface GapQuestion {
  questionId: string;
  materialId: string;
  gapId: string;
  mode: "typed" | "choice";
  word: string;
  also: string[];
  wrong: string[];
  prompt: string;
}

/** GapRow is one option row of a gap's card; an empty text is a row not filled in. */
export interface GapRow {
  text: string;
  isCorrect: boolean;
  source?: Option | undefined;
}

/**
 * RemovedGap is what left the group with a gap, kept so that undoing the
 * removal in the text brings the question back as it was.
 */
export interface RemovedGap {
  binding: GroupGapBinding;
  question: GroupQuestion;
  member: Member;
}

/** GAP_ROWS is how many option rows a gap's card starts with. */
export const GAP_ROWS = 4;

/**
 * gapRow is the row, of GAP_ROWS, a new gap's word lands on: spread evenly
 * over the rows by the gap's id, so it is the same on every visit and nothing
 * is stored for it.
 */
export function gapRow(gapId: string): number {
  let hash = 0;
  for (const char of gapId) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % GAP_ROWS;
}

function promptText(input: Input, blankGapId: string | null): string | null {
  if (input.mediaAssetId != null) return null;
  const content = input.promptContent;
  if (content == null) return blankGapId === null ? input.prompt : null;
  const [block, ...others] = content.blocks;
  if (others.length > 0 || block?.type !== "paragraph") return null;
  const inlines: readonly ContentInline[] = block.content;
  const last = inlines.at(-1);
  if (blankGapId !== null && !(last?.type === "gap" && last.id === blankGapId))
    return null;
  let text = "";
  for (const node of blankGapId === null ? inlines : inlines.slice(0, -1)) {
    if (node.type !== "text" || (node.marks?.length ?? 0) > 0) return null;
    text += node.text;
  }
  return blankGapId === null ? text : text.trimEnd();
}

function readGapQuestion(
  binding: GroupGapBinding,
  materialId: string,
  input: Input,
): GapQuestion | null {
  const base = { questionId: binding.questionId, materialId, gapId: binding.gapId };
  if (binding.kind === "blank") {
    const [blank, ...others] = input.blanks ?? [];
    if (input.type !== "fill_blank" || !blank || others.length > 0) return null;
    if (blank.gapId !== binding.blankGapId) return null;
    const prompt = promptText(input, binding.blankGapId);
    if (prompt === null) return null;
    const [word = "", ...also] = blank.acceptedAnswers;
    return { ...base, mode: "typed", word, also, wrong: [], prompt };
  }
  if (input.type !== "single_choice") return null;
  const prompt = promptText(input, null);
  if (prompt === null) return null;
  const options = input.options ?? [];
  const correct = options.find((option) => option.isCorrect);
  return {
    ...base,
    mode: "choice",
    word: correct?.text ?? "",
    also: [],
    wrong: options.filter((option) => option !== correct).map((option) => option.text),
    prompt,
  };
}

/**
 * gapQuestions reads the bundle's gap questions by question id: each member
 * that exactly one gap is bound to and that has one of GapQuestion's two
 * shapes, with a prompt of one plain paragraph and no media of its own. Any
 * other bound member (a multiple choice, a fill-in with several blanks, a
 * prompt with formatting) is an ordinary question that a gap points at.
 */
export function gapQuestions(bundle: GroupBundle): Map<string, GapQuestion> {
  const inputs = new Map(
    bundle.questions.map((question) => [question.id, question.input]),
  );
  const bound = new Map<string, number>();
  for (const material of bundle.group.stimuli)
    for (const binding of material.gaps)
      bound.set(binding.questionId, (bound.get(binding.questionId) ?? 0) + 1);
  const found = new Map<string, GapQuestion>();
  for (const material of bundle.group.stimuli)
    for (const binding of material.gaps) {
      const input = inputs.get(binding.questionId);
      if (!input || bound.get(binding.questionId) !== 1) continue;
      const read = readGapQuestion(binding, material.id, input);
      if (read) found.set(binding.questionId, read);
    }
  return found;
}

/** boundQuestionIds are the members some gap of the bundle is bound to. */
export function boundQuestionIds(bundle: GroupBundle): Set<string> {
  return new Set(
    bundle.group.stimuli.flatMap((material) =>
      material.gaps.map((binding) => binding.questionId),
    ),
  );
}

function promptContentOf(text: string, blankGapId: string | null) {
  const content: ContentInline[] = [];
  const body = blankGapId === null || text === "" ? text : `${text} `;
  if (body !== "") content.push({ type: "text", text: body, marks: [] });
  if (blankGapId !== null) content.push({ type: "gap", id: blankGapId, label: "1" });
  const document = {
    format: "semantic_v1" as const,
    blocks: [{ type: "paragraph" as const, content }],
  };
  return { prompt: contentPlainText(document), promptContent: document };
}

function typedInput(
  base: Input,
  word: string,
  also: readonly string[],
  text: string,
  blankGapId: string,
): Input {
  const [blank] = base.type === "fill_blank" ? (base.blanks ?? []) : [];
  return {
    ...base,
    ...promptContentOf(text, blankGapId),
    type: "fill_blank",
    options: [],
    blanks: [
      {
        ...(blank?.id == null ? {} : { id: blank.id }),
        gapId: blankGapId,
        ordinal: 1,
        acceptedAnswers: [word, ...also.filter((answer) => answer.trim() !== "")],
        caseSensitive: blank?.caseSensitive ?? false,
      },
    ],
  };
}

function choiceInput(base: Input, rows: readonly GapRow[], text: string): Input {
  return {
    ...base,
    ...promptContentOf(text, null),
    type: "single_choice",
    blanks: [],
    options: rows.map((row) => {
      const kept = row.source?.id == null ? {} : { id: row.source.id };
      const content =
        row.source?.content != null && row.source.text === row.text
          ? { content: row.source.content }
          : {};
      return { ...kept, ...content, text: row.text, isCorrect: row.isCorrect };
    }),
  };
}

/**
 * newGapQuestion is the question a gap is made with: typed, worth one point,
 * accepting `word`, with the typed prompt.
 */
export function newGapQuestion(
  word: string,
  prompts: GapPrompts,
  newId: () => string = () => crypto.randomUUID(),
): { question: GroupQuestion; blankGapId: string } {
  const blankGapId = newId();
  const base: Input = {
    type: "fill_blank",
    level: null,
    skill: null,
    prompt: "",
    points: 1,
    options: [],
    blanks: [],
    tags: [],
  };
  return {
    question: {
      id: newId(),
      input: typedInput(base, word, [], prompts.typed, blankGapId),
    },
    blankGapId,
  };
}

/**
 * gapRows are the option rows a gap's card opens with: a chosen gap's options
 * in their order, then empty rows up to GAP_ROWS; a typed gap's word alone,
 * on the row gapRow gives it.
 */
export function gapRows(bundle: GroupBundle, gap: GapQuestion): GapRow[] {
  const empty = (): GapRow => ({ text: "", isCorrect: false });
  if (gap.mode === "typed")
    return Array.from({ length: GAP_ROWS }, (_, row) =>
      row === gapRow(gap.gapId) ? { text: gap.word, isCorrect: true } : empty(),
    );
  const options =
    bundle.questions.find((question) => question.id === gap.questionId)?.input
      .options ?? [];
  const rows: GapRow[] = options.map((option) => ({
    text: option.text,
    isCorrect: option.isCorrect,
    source: option,
  }));
  while (rows.length < GAP_ROWS) rows.push(empty());
  return rows;
}

/**
 * withGapAnswer writes a gap's card to its question: with a wrong option
 * filled in it is a single-choice question of the filled rows, in their
 * order, and its gap is bound to the question; with none it is a fill-in
 * question whose blank accepts the correct row's word and `also`, and its gap
 * is bound to that blank. A prompt still one of the defaults follows the mode.
 * The question keeps its id, points, explanation and tags.
 */
export function withGapAnswer(
  bundle: GroupBundle,
  gap: GapQuestion,
  answer: { rows: readonly GapRow[]; also: readonly string[]; prompt: string },
  prompts: GapPrompts,
  newId: () => string = () => crypto.randomUUID(),
): GroupBundle {
  const current = bundle.questions.find((question) => question.id === gap.questionId);
  if (!current) return bundle;
  const filled = answer.rows.filter((row) => row.text.trim() !== "");
  const typed = !filled.some((row) => !row.isCorrect);
  const fallback = typed ? prompts.typed : prompts.choice;
  const text = prompts.defaults.has(answer.prompt.trim()) ? fallback : answer.prompt;
  const base = current.input;
  let binding: GroupGapBinding;
  let input: Input;
  if (typed) {
    const [blank] =
      current.input.type === "fill_blank" ? (current.input.blanks ?? []) : [];
    const blankGapId = blank?.gapId ?? newId();
    const word = filled.find((row) => row.isCorrect)?.text ?? "";
    input = typedInput(base, word, answer.also, text, blankGapId);
    binding = {
      kind: "blank",
      gapId: gap.gapId,
      questionId: gap.questionId,
      blankGapId,
    };
  } else {
    input = choiceInput(base, filled, text);
    binding = { kind: "question", gapId: gap.gapId, questionId: gap.questionId };
  }
  return {
    ...bundle,
    questions: bundle.questions.map((question) =>
      question.id === gap.questionId ? { ...question, input } : question,
    ),
    group: {
      ...bundle.group,
      members: bundle.group.members.map((member) =>
        member.questionId === gap.questionId
          ? {
              ...member,
              optionOrder: memberOptionOrder(
                input.type,
                member.optionOrder,
                current.input.type,
              ),
            }
          : member,
      ),
      stimuli: bundle.group.stimuli.map((material) =>
        material.id === gap.materialId
          ? {
              ...material,
              gaps: material.gaps.map((item) =>
                item.gapId === gap.gapId ? binding : item,
              ),
            }
          : material,
      ),
    },
  };
}

function gapOrder(stimuli: readonly GroupMaterial[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const material of stimuli) {
    if (material.content.format !== "semantic_v1") continue;
    const targets = new Map(
      material.gaps.map((binding) => [binding.gapId, binding.questionId]),
    );
    for (const gap of questionGaps(material.content)) {
      const questionId = targets.get(gap.id);
      if (questionId === undefined || seen.has(questionId)) continue;
      seen.add(questionId);
      order.push(questionId);
    }
  }
  return order;
}

/**
 * orderByGaps puts the members that answer gaps in the order of their gaps in
 * the materials, in the places such members hold now, and leaves every other
 * member where it is. `questions` follows the members.
 */
export function orderByGaps(bundle: GroupBundle): GroupBundle {
  const order = gapOrder(bundle.group.stimuli);
  const bound = new Set(order);
  const byId = new Map(
    bundle.group.members.map((member) => [member.questionId, member]),
  );
  let next = 0;
  const members = bundle.group.members.map((member) =>
    bound.has(member.questionId) ? (byId.get(order[next++]!) ?? member) : member,
  );
  const byQuestion = new Map(
    bundle.questions.map((question) => [question.id, question]),
  );
  const questions = members.flatMap((member) => {
    const question = byQuestion.get(member.questionId);
    return question ? [question] : [];
  });
  const unchanged =
    questions.length === bundle.questions.length &&
    questions.every((question, index) => question === bundle.questions[index]) &&
    members.every((member, index) => member === bundle.group.members[index]);
  if (unchanged) return bundle;
  return { ...bundle, questions, group: { ...bundle.group, members } };
}

function placeMember(
  members: readonly Member[],
  member: Member,
  stimuli: readonly GroupMaterial[],
): Member[] {
  const order = gapOrder(stimuli);
  const at = order.indexOf(member.questionId);
  const index = (questionId: string | undefined) =>
    questionId === undefined
      ? -1
      : members.findIndex((item) => item.questionId === questionId);
  const before = index(order[at - 1]);
  const after = index(order[at + 1]);
  const next = [...members];
  if (before >= 0) next.splice(before + 1, 0, member);
  else if (after >= 0) next.splice(after, 0, member);
  else next.push(member);
  return next;
}

/**
 * MaterialSync is a bundle after a material's text changed, with the ids of
 * the questions made for its new gaps and what left with the gaps that went.
 */
export interface MaterialSync {
  bundle: GroupBundle;
  made: string[];
  removed: RemovedGap[];
}

interface Answers {
  questions: GroupBundle["questions"];
  members: Member[];
  kept: Map<string, GroupGapBinding>;
}

function withoutGoneGaps(
  bundle: GroupBundle,
  material: GroupMaterial,
  here: ReadonlySet<string>,
): Answers & { removed: RemovedGap[] } {
  const known = gapQuestions(bundle);
  const kept = new Map<string, GroupGapBinding>();
  const removed: RemovedGap[] = [];
  let questions = bundle.questions;
  let members = bundle.group.members;
  for (const binding of material.gaps) {
    if (here.has(binding.gapId)) {
      kept.set(binding.gapId, binding);
      continue;
    }
    const question = questions.find((item) => item.id === binding.questionId);
    const member = members.find((item) => item.questionId === binding.questionId);
    if (!known.has(binding.questionId) || !question || !member) continue;
    removed.push({ binding, question, member });
    questions = questions.filter((item) => item !== question);
    members = members.filter((item) => item !== member);
  }
  return { questions, members, kept, removed };
}

function withNewGaps(
  answers: Answers,
  present: readonly string[],
  context: MaterialContext,
): Answers & { made: string[]; added: Member[] } {
  const kept = new Map(answers.kept);
  let questions = answers.questions;
  const made: string[] = [];
  const added: Member[] = [];
  for (const gapId of present) {
    if (kept.has(gapId)) continue;
    const back = context.restore.get(gapId);
    if (back && !questions.some((item) => item.id === back.question.id)) {
      kept.set(gapId, back.binding);
      questions = [...questions, back.question];
      added.push(back.member);
      continue;
    }
    const { question, blankGapId } = newGapQuestion(
      context.words.get(gapId) ?? "",
      context.prompts,
      context.newId,
    );
    kept.set(gapId, { kind: "blank", gapId, questionId: question.id, blankGapId });
    questions = [...questions, question];
    added.push({ questionId: question.id, optionOrder: "shuffle" });
    made.push(question.id);
  }
  return { questions, members: answers.members, kept, made, added };
}

/**
 * MaterialContext is what withMaterialContent knows beyond the bundle: the
 * word of each gap just made, what each removed gap took with it, and the
 * prompts a new gap's question starts with.
 */
export interface MaterialContext {
  words: ReadonlyMap<string, string>;
  restore: ReadonlyMap<string, RemovedGap>;
  prompts: GapPrompts;
  newId?: () => string;
}

/**
 * withMaterialContent writes a material's text and keeps the rule that every
 * gap has exactly one answer. A gap that left the text takes its gap question
 * with it (reported in `removed`); an ordinary question it pointed at stays.
 * A gap new to the text gets back what `restore` holds for it, else a typed
 * gap question accepting `words`' word for it, placed beside the questions of
 * the gaps around it. Gap questions then follow the order of the gaps.
 */
export function withMaterialContent(
  bundle: GroupBundle,
  materialId: string,
  content: SemanticContent,
  context: MaterialContext,
): MaterialSync {
  const material = bundle.group.stimuli.find((item) => item.id === materialId);
  if (!material) return { bundle, made: [], removed: [] };
  const present = questionGaps(content).map((gap) => gap.id);
  const gone = withoutGoneGaps(bundle, material, new Set(present));
  const next = withNewGaps(gone, present, context);
  const stimuli = bundle.group.stimuli.map((item) =>
    item.id === materialId
      ? {
          ...material,
          content,
          gaps: present.flatMap((gapId) => {
            const binding = next.kept.get(gapId);
            return binding ? [binding] : [];
          }),
        }
      : item,
  );
  let members = next.members;
  for (const member of next.added) members = placeMember(members, member, stimuli);
  return {
    bundle: orderByGaps({
      ...bundle,
      questions: next.questions,
      group: { ...bundle.group, members, stimuli },
    }),
    made: next.made,
    removed: gone.removed,
  };
}

/**
 * unfinishedMember is the first member, in the group's order, that is not
 * complete, with the translation key of what it lacks; null when every member
 * would save.
 */
export function unfinishedMember(
  bundle: GroupBundle,
): { questionId: string; issue: string } | null {
  const inputs = new Map(
    bundle.questions.map((question) => [question.id, question.input]),
  );
  for (const member of bundle.group.members) {
    const input = inputs.get(member.questionId);
    if (!input) continue;
    const parsed = questionSchema.safeParse(memberValues(input));
    if (parsed.success) continue;
    const message = parsed.error.issues[0]?.message ?? "";
    return {
      questionId: member.questionId,
      issue: message.startsWith("questionEditor.") ? message : "groups.invalidQuestion",
    };
  }
  return null;
}

function inlineText(node: ContentInline, word: (gapId: string) => string): string {
  switch (node.type) {
    case "text":
      return node.text;
    case "break":
      return " ";
    case "gap":
      return word(node.id);
    case "link":
      return node.content.map((text) => text.text).join("");
  }
}

function gapBlock(
  blocks: readonly ContentBlock[],
  gapId: string,
): readonly ContentInline[] | null {
  for (const block of blocks) {
    const found = gapIn(block, gapId);
    if (found) return found;
  }
  return null;
}

function gapIn(block: ContentBlock, gapId: string): readonly ContentInline[] | null {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return block.content.some((node) => node.type === "gap" && node.id === gapId)
        ? block.content
        : null;
    case "list":
      return gapBlock(block.items.flat(), gapId);
    case "table":
      return gapBlock(
        block.rows.flatMap((row) => row.flatMap((cell) => cell.content)),
        gapId,
      );
    default:
      return null;
  }
}

const SENTENCE_END = new Set([".", "?", "!", "…"]);

function lastSentenceStart(text: string): number {
  for (let index = text.length - 1; index > 0; index--)
    if (/\s/u.test(text[index]!) && SENTENCE_END.has(text[index - 1]!)) {
      let start = index;
      while (start < text.length && /\s/u.test(text[start]!)) start++;
      return start;
    }
  return 0;
}

function firstSentence(text: string): string {
  const end = [...text].findIndex((char) => SENTENCE_END.has(char));
  return end < 0 ? text : [...text].slice(0, end + 1).join("");
}

/**
 * gapSentence is the sentence a gap stands in, as the text before it and the
 * text after it, with an ellipsis where the paragraph goes on; `word` gives
 * what to print for another gap of the sentence. Null when the content holds
 * no such gap.
 */
export function gapSentence(
  content: SemanticContent,
  gapId: string,
  word: (gapId: string) => string,
): { before: string; after: string } | null {
  const inlines = gapBlock(content.blocks, gapId);
  if (!inlines) return null;
  const at = inlines.findIndex((node) => node.type === "gap" && node.id === gapId);
  const text = (nodes: readonly ContentInline[]) =>
    nodes.map((node) => inlineText(node, word)).join("");
  const left = text(inlines.slice(0, at));
  const right = text(inlines.slice(at + 1));
  const from = lastSentenceStart(left);
  const before = from > 0 ? `… ${left.slice(from)}` : left;
  const head = firstSentence(right);
  const closed = head === "" || SENTENCE_END.has(head.at(-1) ?? "");
  const after = closed ? head : `${head.trimEnd()} …`;
  return { before, after };
}
