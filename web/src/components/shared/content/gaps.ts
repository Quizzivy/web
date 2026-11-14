import type { ContentInline, ProseBlock } from "./model";
import type { QuestionPromptContent } from "./questionContent";

type TextNode = Extract<ContentInline, { type: "text" }>;

export type QuestionGap = Extract<ContentInline, { type: "gap" }>;

/** questionGaps returns stable gaps in document order, including nested lists and table cells. */
export function questionGaps(
  document: Readonly<{ blocks: readonly ProseBlock[] }>,
): QuestionGap[] {
  const gaps: QuestionGap[] = [];
  const visit = (block: ProseBlock) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
        for (const node of block.content) if (node.type === "gap") gaps.push(node);
        break;
      case "list":
        block.items.forEach((item) => item.forEach(visit));
        break;
      case "table":
        block.rows.forEach((row) => row.forEach((cell) => cell.content.forEach(visit)));
        break;
    }
  };
  document.blocks.forEach(visit);
  return gaps;
}

/** gapBindingsMatch requires one metadata row for each gap, without interpreting its label or ordinal. */
export function gapBindingsMatch(
  document: QuestionPromptContent,
  blanks: ReadonlyArray<{ gapId?: string | null | undefined }>,
): boolean {
  const remaining = new Set(questionGaps(document).map((gap) => gap.id));
  if (remaining.size !== blanks.length) return false;
  for (const blank of blanks)
    if (blank.gapId == null || !remaining.delete(blank.gapId)) return false;
  return remaining.size === 0;
}

/** PRINTED_BLANK is what a gap inside a sentence reads as once it is a gap no longer: the underscores a printed test leaves for a missing word. */
export const PRINTED_BLANK = "___";

const SENTENCE_END = /[?.!:;…]$/u;

function isSpace(node: ContentInline): boolean {
  return node.type === "text" && node.text.trim() === "";
}

function inlineText(node: ContentInline): string {
  if (node.type === "text") return node.text;
  if (node.type === "link") return node.content.map((part) => part.text).join("");
  return node.type === "gap" ? PRINTED_BLANK : "\n";
}

function sameMarks(a: TextNode, b: TextNode): boolean {
  return (
    a.marks.length === b.marks.length && a.marks.every((mark, i) => mark === b.marks[i])
  );
}

/** answerLineStart is where a line's closing run of gaps begins when that run is an answer line: nothing but gaps and spaces to the end, after no text or after a finished sentence. */
function answerLineStart(content: readonly ContentInline[]): number | null {
  let start = content.length;
  while (
    start > 0 &&
    (content[start - 1]!.type === "gap" || isSpace(content[start - 1]!))
  )
    start--;
  if (!content.slice(start).some((node) => node.type === "gap")) return null;
  const before = content.slice(0, start).map(inlineText).join("").trimEnd();
  return before === "" || SENTENCE_END.test(before) ? start : null;
}

function settleInline(content: readonly ContentInline[]): ContentInline[] {
  if (content.every((node) => node.type !== "gap")) return [...content];
  const cut = answerLineStart(content);
  const kept = cut === null ? content : content.slice(0, cut);
  const out: ContentInline[] = [];
  for (const node of kept) {
    const next: ContentInline =
      node.type === "gap" ? { type: "text", text: PRINTED_BLANK, marks: [] } : node;
    const last = out.at(-1);
    if (next.type === "text" && last?.type === "text" && sameMarks(last, next))
      out[out.length - 1] = { ...last, text: last.text + next.text };
    else out.push(next);
  }
  const last = out.at(-1);
  if (cut !== null && last?.type === "text") {
    const text = last.text.trimEnd();
    if (text === "") out.pop();
    else out[out.length - 1] = { ...last, text };
  }
  return out;
}

function settleBlock<B extends ProseBlock>(block: B): B {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return { ...block, content: settleInline(block.content) };
    case "list":
      return {
        ...block,
        items: block.items.map((item) => item.map((node) => settleBlock(node))),
      };
    case "table":
      return {
        ...block,
        rows: block.rows.map((row) =>
          row.map((cell) => ({
            ...cell,
            content: cell.content.map((node) => settleBlock(node)),
          })),
        ),
      };
    default:
      return block;
  }
}

function emptied(before: ProseBlock, after: ProseBlock): boolean {
  return (
    (after.type === "paragraph" || after.type === "heading") &&
    after.content.length === 0 &&
    (before.type === "paragraph" || before.type === "heading") &&
    before.content.length > 0
  );
}

/**
 * settleGaps writes a prompt's gaps out for a question that binds no blank,
 * the way a printed test reads. A gap that only leaves room for the answer,
 * the closing run of a line that is empty before it or ends a sentence
 * ("Where do you live? [1]"), goes, and a line it empties goes with it. A gap
 * inside a sentence ("She [1] to school.") becomes PRINTED_BLANK, in lists
 * and table cells too. A prompt that was nothing but gaps keeps one printed
 * blank, since a question needs a prompt. A document without gaps is returned
 * as it is.
 */
export function settleGaps<D extends Readonly<{ blocks: readonly ProseBlock[] }>>(
  document: D,
): D {
  if (questionGaps(document).length === 0) return document;
  const settled = document.blocks.map((block) => settleBlock(block));
  const blocks = settled.filter((block, i) => !emptied(document.blocks[i]!, block));
  if (blocks.length > 0) return { ...document, blocks };
  return {
    ...document,
    blocks: [
      {
        type: "paragraph",
        content: [{ type: "text", text: PRINTED_BLANK, marks: [] }],
      },
    ],
  };
}
