import type { QuestionValues } from "@/features/question-bank/questionSchema";

const LISTS = ["options", "blanks", "matchItems", "rubric"] as const;

type Row = { id?: string | null };

/**
 * forkRowIds records, after an edit that forked the question (T-R7.6), which
 * row of the fork each row of the original became. The fork is made from the
 * body that was sent, so its lists have the same rows in the same order: a
 * row is matched by position, and only while both lists have one length.
 */
export function forkRowIds(
  map: Map<string, string>,
  sent: QuestionValues,
  fork: QuestionValues,
): void {
  for (const key of LISTS) {
    const before = sent[key] as readonly Row[] | undefined;
    const after = fork[key] as readonly Row[] | undefined;
    if (!before || !after || before.length !== after.length) continue;
    before.forEach((row, i) => {
      const next = after[i]?.id;
      if (row.id && next && row.id !== next) map.set(row.id, next);
    });
  }
}

/**
 * withRowIds gives a body the fork's row ids where the form still holds the
 * original's, so typing after a fork updates the fork's rows rather than
 * naming rows of a question it no longer edits. Without a map it is the body.
 */
export function withRowIds(
  body: QuestionValues,
  map: ReadonlyMap<string, string>,
): QuestionValues {
  if (map.size === 0) return body;
  let out = body;
  for (const key of LISTS) {
    const rows = body[key] as readonly Row[] | undefined;
    if (!rows?.some((row) => row.id != null && map.has(row.id))) continue;
    out = {
      ...out,
      [key]: rows.map((row) =>
        row.id != null && map.has(row.id) ? { ...row, id: map.get(row.id) } : row,
      ),
    };
  }
  return out;
}
