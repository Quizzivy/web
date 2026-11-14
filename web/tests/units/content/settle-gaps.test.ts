import { describe, expect, it } from "vitest";
import {
  PRINTED_BLANK,
  questionGaps,
  settleGaps,
} from "@/components/shared/content/gaps";
import type { ContentInline, SemanticContent } from "@/components/shared/content/model";
import { contentPlainText } from "@/components/shared/content/plainText";
import { isQuestionContent } from "@/components/shared/content/questionContent";

const gap = (id: string, label = "1"): ContentInline => ({ type: "gap", id, label });
const text = (value: string, marks: ("bold" | "italic")[] = []): ContentInline => ({
  type: "text",
  text: value,
  marks,
});
const prompt = (...lines: ContentInline[][]): SemanticContent => ({
  format: "semantic_v1",
  blocks: lines.map((content) => ({ type: "paragraph", content })),
});

function settled(...lines: ContentInline[][]): string {
  const out = settleGaps(prompt(...lines));
  expect(questionGaps(out)).toEqual([]);
  expect(isQuestionContent(out)).toBe(true);
  return contentPlainText(out);
}

describe("settleGaps", () => {
  it("removes a gap that only leaves room for the answer, with the space before it", () => {
    expect(settled([text("Where do you live? "), gap("a")])).toBe("Where do you live?");
    expect(settled([text("Name:"), gap("a"), text(" ")])).toBe("Name:");
    expect(settled([text("Answer. "), gap("a"), text(" "), gap("b", "2")])).toBe(
      "Answer.",
    );
  });

  it("writes a gap inside a sentence out as a printed blank", () => {
    expect(settled([text("She "), gap("a"), text(" to school.")])).toBe(
      `She ${PRINTED_BLANK} to school.`,
    );
    expect(settled([text("She lives in "), gap("a"), text(".")])).toBe(
      `She lives in ${PRINTED_BLANK}.`,
    );
    expect(settled([text("She lives in "), gap("a")])).toBe(
      `She lives in ${PRINTED_BLANK}`,
    );
    expect(
      settled([
        text("From "),
        gap("a"),
        text(" to "),
        gap("b", "2"),
        text(" o'clock."),
      ]),
    ).toBe(`From ${PRINTED_BLANK} to ${PRINTED_BLANK} o'clock.`);
  });

  it("treats each line on its own, and drops a line it empties", () => {
    expect(
      settled(
        [text("Read and answer.")],
        [gap("a")],
        [text("He "), gap("b", "2"), text(" tea. "), gap("c", "3")],
      ),
    ).toBe(`Read and answer.\n\nHe ${PRINTED_BLANK} tea.`);
  });

  it("leaves one printed blank where the prompt was nothing but gaps", () => {
    expect(settled([gap("a")])).toBe(PRINTED_BLANK);
    expect(settled([gap("a"), text(" ")], [gap("b", "2")])).toBe(PRINTED_BLANK);
  });

  it("keeps marks, and joins a blank to plain text beside it", () => {
    const out = settleGaps(
      prompt([text("in ", ["bold"]), gap("a"), text(" now"), text("?", ["bold"])]),
    );
    expect(out.blocks[0]).toEqual({
      type: "paragraph",
      content: [
        text("in ", ["bold"]),
        text(`${PRINTED_BLANK} now`),
        text("?", ["bold"]),
      ],
    });
  });

  it("reaches gaps in lists and table cells", () => {
    const nested: SemanticContent = {
      format: "semantic_v1",
      blocks: [
        {
          type: "list",
          ordered: false,
          start: 1,
          items: [[{ type: "paragraph", content: [text("a "), gap("a"), text(" b")] }]],
        },
        {
          type: "table",
          rows: [
            [
              {
                header: false,
                rowSpan: 1,
                colSpan: 1,
                content: [
                  { type: "paragraph", content: [text("Total: "), gap("b", "2")] },
                ],
              },
            ],
          ],
        },
      ],
    };
    const out = settleGaps(nested);
    expect(questionGaps(out)).toEqual([]);
    expect(contentPlainText(out)).toBe(`a ${PRINTED_BLANK} b\n\nTotal:`);
  });

  it("returns a document without gaps as it is", () => {
    const plain = prompt([text("No gap here.")]);
    expect(settleGaps(plain)).toBe(plain);
  });
});
