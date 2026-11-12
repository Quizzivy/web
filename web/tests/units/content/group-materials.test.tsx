import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GroupMaterials } from "@/components/shared/content/GroupMaterials";
import type { components } from "@/lib/api/schema";
import "@/lib/i18n";

type StudentGroup = components["schemas"]["StudentGroup"];
type Gap = StudentGroup["stimuli"][number]["gaps"][number];

const TYPED = "01935000-0000-7000-8000-0000000000a1";
const TWO_BLANKS = "01935000-0000-7000-8000-0000000000a2";
const CHOSEN = "01935000-0000-7000-8000-0000000000a3";

function group(gaps: Gap[]): StudentGroup {
  return {
    id: "01935000-0000-7000-8000-0000000000b1",
    sectionId: "01935000-0000-7000-8000-0000000000b2",
    title: "Green spaces",
    questionIds: [TYPED, TWO_BLANKS, CHOSEN],
    stimuli: [
      {
        id: "01935000-0000-7000-8000-0000000000b3",
        title: "Green spaces",
        content: {
          format: "semantic_v1",
          blocks: [
            {
              type: "paragraph",
              content: gaps.flatMap((gap, index) => [
                { type: "text" as const, text: ` word${index} `, marks: [] },
                { type: "gap" as const, id: gap.gapId, label: `L${index + 1}` },
              ]),
            },
          ],
        },
        gaps,
      },
    ],
    recordings: [],
    assets: [],
  };
}

const GAPS: Gap[] = [
  { kind: "blank", gapId: "g1", questionId: TYPED, blankGapId: "b1" },
  { kind: "blank", gapId: "g2", questionId: TWO_BLANKS, blankGapId: "b2" },
  { kind: "blank", gapId: "g3", questionId: TWO_BLANKS, blankGapId: "b3" },
  { kind: "question", gapId: "g4", questionId: CHOSEN },
];
const NUMBERS = new Map([
  [TYPED, 9],
  [TWO_BLANKS, 10],
  [CHOSEN, 11],
]);

function printed(numbers?: ReadonlyMap<string, number>) {
  render(
    <GroupMaterials
      group={group(GAPS)}
      numbers={numbers}
      renderAudio={() => null}
      renderGap={(gap, label) => <b data-testid={gap.gapId}>{label}</b>}
    />,
  );
  return GAPS.map((gap) => screen.getByTestId(gap.gapId).textContent);
}

it("hands a gap that alone is answered by its question's blank the question's number, and every other gap its label", () => {
  expect(printed(NUMBERS)).toEqual(["9", "L2", "L3", "L4"]);
});

it("hands every gap its label where the questions' numbers are not given, or the gap's question has none", () => {
  expect(printed()).toEqual(["L1", "L2", "L3", "L4"]);
  document.body.innerHTML = "";
  expect(printed(new Map([[CHOSEN, 11]]))).toEqual(["L1", "L2", "L3", "L4"]);
});
