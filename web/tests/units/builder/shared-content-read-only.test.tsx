import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { http } from "msw";
import type { StoredGroup } from "@/features/question-groups/api";
import { contractJson } from "@tests/support/contractResponse";
import { server } from "@tests/support/server";
import {
  BASE,
  SECTION_ID,
  builderTest,
  recordWrites,
  renderBuilder,
  sent,
  serveBuilder,
  signIn,
  signOut,
} from "./access-support";

const GROUP_ID = "018f0000-0000-7000-8000-0000000007d1";
const MEMBER_ID = "018f0000-0000-7000-8000-0000000007e1";
const STAMP = "2026-11-10T03:00:00Z";

/** stored is a passage whose one gap is bound to its choice question. */
const stored: StoredGroup = {
  bundle: {
    group: {
      id: GROUP_ID,
      title: "Why cities need green space",
      members: [{ questionId: MEMBER_ID, optionOrder: "shuffle" }],
      stimuli: [
        {
          id: "018f0000-0000-7000-8000-0000000007e9",
          title: "Green streets",
          content: {
            format: "semantic_v1",
            blocks: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Parks ", marks: [] },
                  { type: "gap", id: "g1", label: "1" },
                  { type: "text", text: " the streets in summer.", marks: [] },
                ],
              },
            ],
          },
          gaps: [{ kind: "question", gapId: "g1", questionId: MEMBER_ID }],
        },
      ],
      recordings: [],
    },
    questions: [
      {
        id: MEMBER_ID,
        input: {
          type: "single_choice",
          level: null,
          skill: null,
          prompt: "What do parks do to the streets?",
          points: 1,
          options: [
            { text: "cool", isCorrect: true },
            { text: "heat", isCorrect: false },
          ],
          blanks: [],
          tags: [],
        },
      },
    ],
  },
  ownerSectionId: SECTION_ID,
  revision: 3,
  testUpdatedAt: STAMP,
  archivedAt: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  assets: [],
  unavailableAssetIds: [],
};

beforeEach(() => {
  signIn();
  recordWrites();
  serveBuilder(
    builderTest("use", {
      sections: [
        {
          id: SECTION_ID,
          ordinal: 0,
          title: "Đọc hiểu",
          instructions: null,
          questionIds: [],
          units: [{ kind: "group", id: GROUP_ID }],
        },
      ],
    }),
  );
  server.use(
    http.get(`${BASE}/teacher/question-groups/:id`, () =>
      contractJson("/teacher/question-groups/{id}", "get", 200, stored),
    ),
  );
});

afterEach(signOut);

/**
 * What took the Shared content dialog's place since v0.13.4 (DG-231) is the
 * group's pane, so a Can-use recipient reads the passage there: every part
 * shown and inert, and the group's save never called.
 */
describe("a shared group for a Can use recipient", () => {
  it("shows the passage, its gap and its question, with nothing that edits or saves", async () => {
    renderBuilder();
    const pane = await screen.findByRole("region", {
      name: "Why cities need green space",
    });
    expect(await within(pane).findByText("Green streets")).toBeVisible();
    expect(within(pane).getByLabelText("Chỗ trống 1: cool")).toBeVisible();
    expect(within(pane).getByText("What do parks do to the streets?")).toBeVisible();
    expect(within(pane).getByText("Câu 1")).toBeVisible();

    expect(within(pane).queryAllByRole("textbox")).toEqual([]);
    expect(within(pane).queryByRole("button", { name: /Lưu/ })).toBeNull();
    expect(within(pane).queryByRole("button", { name: /Tạo chỗ trống/ })).toBeNull();
    expect(within(pane).queryByRole("button", { name: /Thêm câu hỏi/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thao tác khác" })).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(sent).toEqual([]);
  });
});
