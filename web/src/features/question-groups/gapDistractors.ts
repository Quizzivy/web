import type { AiGapDistractorsRequest } from "@/features/ai/api";
import type { GapRow } from "./gapQuestions";

const SENTENCE_SIDE = 1000;
const ANSWER = 200;
const OPTION = 500;
const ANSWERS = 20;
const OPTIONS = 10;

function written(texts: readonly string[], length: number, count: number): string[] {
  return texts
    .map((text) => text.trim().slice(0, length))
    .filter((text) => text !== "")
    .slice(0, count);
}

/**
 * gapDistractorsRequest is what "Suggest wrong options" sends for a gap: the
 * sentence the card quotes, without the ellipses that say the paragraph goes
 * on, the word and the other answers the gap accepts, and the wrong options
 * its rows hold, each within the contract's limits. Null when the gap has no
 * word yet.
 */
export function gapDistractorsRequest(
  sentence: { before: string; after: string } | null,
  rows: readonly GapRow[],
  also: readonly string[],
): AiGapDistractorsRequest | null {
  const word = rows.find((row) => row.isCorrect)?.text.trim() ?? "";
  if (word === "") return null;
  const before = (sentence?.before ?? "").replace(/^… /u, "");
  const after = (sentence?.after ?? "").replace(/ …$/u, "");
  return {
    before: before.slice(-SENTENCE_SIDE),
    after: after.slice(0, SENTENCE_SIDE),
    answers: written([word, ...also], ANSWER, ANSWERS),
    options: written(
      rows.filter((row) => !row.isCorrect).map((row) => row.text),
      OPTION,
      OPTIONS,
    ),
  };
}

/**
 * withSuggestion writes `text` on the first of a gap's rows that is not
 * filled in, and is null when every row is.
 */
export function withSuggestion(rows: readonly GapRow[], text: string): GapRow[] | null {
  const at = rows.findIndex((row) => !row.isCorrect && row.text.trim() === "");
  if (at < 0) return null;
  return rows.map((row, index) => (index === at ? { ...row, text } : row));
}
