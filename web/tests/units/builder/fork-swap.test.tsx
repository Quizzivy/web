import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { contractJson } from "@tests/support/contractResponse";
import { server } from "@tests/support/server";
import {
  BASE,
  Q1,
  READ_AT,
  SECTION_ID,
  TEST_AT,
  builderTest,
  choice,
  renderBuilder,
  serveBuilder,
  signIn,
  signOut,
} from "./access-support";

const FORK = "018f0000-0000-7000-8000-0000000007f1";
const FORK_AT = "2026-11-16T04:00:00Z";
const TEST_AFTER_FORK = "2026-11-16T04:00:01Z";

type Edit = { path: string; body: Record<string, unknown> };

let edits: Edit[] = [];
let outline: Record<string, unknown>[] = [];
let testAt = TEST_AT;
let questionPatches = 0;

beforeEach(() => {
  signIn();
  edits = [];
  outline = [];
  testAt = TEST_AT;
  questionPatches = 0;
  serveBuilder(builderTest("edit"), [choice(Q1)]);
  server.use(
    http.patch(
      `${BASE}/teacher/tests/:id/questions/:questionId`,
      async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const questionId = String(params["questionId"]);
        edits.push({ path: questionId, body });
        // The original is used elsewhere: the first edit forks it, and the
        // fork, used only here, is then edited in place.
        const forked = questionId === Q1;
        testAt = forked ? TEST_AFTER_FORK : `2026-11-16T04:00:0${edits.length}Z`;
        return contractJson(
          "/teacher/tests/{id}/questions/{questionId}",
          "patch",
          200,
          {
            question: choice(FORK, {
              points: body["points"] as number,
              updatedAt: forked ? FORK_AT : `2026-11-16T04:10:0${edits.length}Z`,
            }),
            forked,
            testUpdatedAt: testAt,
          },
        );
      },
    ),
    http.patch(`${BASE}/teacher/questions/:id`, () => {
      questionPatches += 1;
      return new Response(null, { status: 500 });
    }),
    http.patch(`${BASE}/teacher/tests/:id`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      outline.push(body);
      return contractJson(
        "/teacher/tests/{id}",
        "patch",
        200,
        builderTest("edit", {
          updatedAt: "2026-11-16T05:00:00Z",
          sections: [
            {
              id: SECTION_ID,
              ordinal: 0,
              title: "Đọc hiểu",
              instructions: null,
              questionIds: [FORK],
            },
          ],
        }),
      );
    }),
  );
});

afterEach(signOut);

async function setPoints(
  user: ReturnType<typeof renderBuilder>["user"],
  value: string,
) {
  const points = await screen.findByLabelText("Điểm");
  await user.clear(points);
  await user.type(points, value);
  return points;
}

describe("a Can edit recipient's question edit that forks", () => {
  it("saves through the test, swaps to the fork, then types into the fork", async () => {
    const { user } = renderBuilder();
    await user.click(
      await screen.findByRole("button", { name: /collocates/ }, { timeout: 5000 }),
    );
    const points = await setPoints(user, "3");

    await waitFor(() => expect(edits).toHaveLength(1), { timeout: 4000 });
    expect(edits[0]?.path).toBe(Q1);
    expect(edits[0]?.body).toMatchObject({ points: 3, expectedUpdatedAt: READ_AT });
    expect(
      await screen.findByText(
        "Đã lưu thành một bản sao mới của câu hỏi này, vì Đức đang dùng câu gốc ở nơi khác.",
      ),
    ).toBeVisible();

    // The pane stays mounted on the fork: the same field, nothing lost.
    expect(screen.getByLabelText("Điểm")).toBe(points);
    await setPoints(user, "4");
    await waitFor(() => expect(edits).toHaveLength(2), { timeout: 4000 });
    expect(edits[1]?.path).toBe(FORK);
    expect(edits[1]?.body).toMatchObject({ points: 4, expectedUpdatedAt: FORK_AT });
    // The fork's option rows, not the original's.
    const options = edits[1]?.body["options"] as { id: string }[];
    expect(options.map((option) => option.id)).toEqual(
      choice(FORK).options!.map((option) => option.id),
    );
    expect(questionPatches).toBe(0);

    // The outline adopts the test's updatedAt each edit answered, and holds the fork.
    await user.click(screen.getByRole("button", { name: "Tên đề thi" }));
    await user.type(screen.getByRole("textbox", { name: "Tên đề thi" }), " A");
    await waitFor(() => expect(outline).toHaveLength(1), { timeout: 4000 });
    expect(outline[0]?.["expectedUpdatedAt"]).toBe(testAt);
    expect(JSON.stringify(outline[0])).toContain(FORK);
    expect(JSON.stringify(outline[0])).not.toContain(Q1);
  }, 20_000);
});
