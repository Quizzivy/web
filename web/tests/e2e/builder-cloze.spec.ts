import { storedGroupBundle } from "@tests/support/storedGroupBundle";
import { expect, test } from "@playwright/test";
import { adminUser, sessionAs, stubApi } from "./support/api";
import { paneText, paneTitle, startGroup } from "./support/groupPane";
import type { components } from "../../src/lib/api/schema";

type Stored = components["schemas"]["StoredQuestionGroup"];

test("a cloze started from the outline is built by selecting words, and each gap is saved with its question", async ({
  page,
}) => {
  const testId = "019535d9-3df7-79fb-b466-fa907fa17fc1";
  const sectionId = "019535d9-3df7-79fb-b466-fa907fa17fc2";
  const stamp = "2026-11-12T00:00:00Z";
  const groups = new Map<string, Stored>();
  const draft: components["schemas"]["Test"] = {
    skills: [],
    assignments: { live: 0, scheduled: 0, closed: 0 },
    unpublishedChanges: null,
    id: testId,
    title: "Đề điền từ",
    description: null,
    status: "draft",
    currentVersion: 0,
    nextVersion: 1,
    totalPoints: 0,
    questionCount: 0,
    audioCount: 0,
    sections: [
      { id: sectionId, ordinal: 0, title: "Phần 1", questionIds: [], units: [] },
    ],
    createdAt: stamp,
    updatedAt: stamp,
  };
  const latest = () => [...groups.values()][0]!;
  await stubApi(page, {
    ...sessionAs(adminUser),
    [`GET /teacher/tests/${testId}`]: (route) => route.fulfill({ json: draft }),
    "POST /teacher/question-groups": async (route) => {
      const input = route
        .request()
        .postDataJSON() as components["schemas"]["GroupCreateInput"];
      const stored: Stored = {
        bundle: storedGroupBundle(input.bundle),
        ownerSectionId: input.ownerSectionId ?? null,
        revision: 1,
        testUpdatedAt: stamp,
        archivedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
        assets: [],
        unavailableAssetIds: [],
      };
      const id = stored.bundle.group.id;
      groups.set(id, stored);
      await page.route(
        `http://localhost:8080/teacher/question-groups/${id}`,
        (group) => {
          if (group.request().method() === "GET")
            return group.fulfill({ json: groups.get(id) });
          const update = group
            .request()
            .postDataJSON() as components["schemas"]["GroupUpdateInput"];
          const before = groups.get(id)!;
          expect(update.expectedRevision).toBe(before.revision);
          const next = {
            ...before,
            bundle: storedGroupBundle(update.bundle),
            revision: before.revision + 1,
          };
          groups.set(id, next);
          return group.fulfill({ json: next });
        },
      );
      return route.fulfill({ status: 201, json: stored });
    },
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/teacher/tests/${testId}/edit`);

  await startGroup(page, "Bài điền từ");
  await expect(paneTitle(page)).toBeFocused();
  await expect(paneTitle(page)).toHaveValue("Bài điền từ mới");
  await expect(
    page.getByText("Bài điền từ trong ba bước", { exact: true }),
  ).toBeVisible();
  expect(latest().bundle.group.stimuli).toHaveLength(1);
  await page.keyboard.insertText("Green spaces");
  await expect(paneTitle(page)).toHaveValue("Green spaces");

  const makeGap = page.getByRole("button", { name: "Tạo chỗ trống", exact: true });
  await expect(makeGap).toBeDisabled();
  await paneText(page).click();
  await page.keyboard.insertText("Parks give people a place to relax");
  await expect(page.getByText("7 từ", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Bài điền từ trong ba bước", { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await expect(makeGap.first()).toBeEnabled();
  await makeGap.last().click();

  const outline = page.locator("[data-outline-group]");
  await expect(
    page.getByRole("heading", { name: "Chỗ trống 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Bài điền từ trong ba bước", { exact: true }),
  ).toHaveCount(0);
  await expect(
    outline.getByRole("img", { name: "Bài điền từ", exact: true }),
  ).toBeVisible();
  await expect(outline.locator("[data-outline-question]")).toContainText("relax");
  await expect(
    page.getByText("1 chỗ trống · 1 tự điền", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[role="status"][data-state="saved"]')).toBeVisible();
  const typed = latest().bundle;
  expect(typed.group.title).toBe("Green spaces");
  expect(typed.group.stimuli[0]!.title).toBe("Green spaces");
  expect(typed.questions).toHaveLength(1);
  expect(typed.questions[0]!.input.type).toBe("fill_blank");
  expect(typed.questions[0]!.input.blanks?.[0]?.acceptedAnswers).toEqual(["relax"]);
  expect(typed.group.stimuli[0]!.gaps[0]).toMatchObject({
    kind: "blank",
    questionId: typed.questions[0]!.id,
  });

  await paneText(page).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+ArrowRight");
  await expect(makeGap.first()).toBeEnabled();
  await makeGap.first().click();
  await expect(
    page.getByRole("heading", { name: "Chỗ trống 1", exact: true }),
  ).toBeVisible();
  await expect(outline.locator("[data-outline-question]")).toHaveCount(2);
  await expect(outline.locator("[data-outline-question]").first()).toContainText(
    "Parks",
  );
  await expect(page.locator('[role="status"][data-state="saved"]')).toBeVisible();
  await expect
    .poll(() =>
      latest().bundle.group.members.map(
        (member) =>
          latest().bundle.questions.find(
            (question) => question.id === member.questionId,
          )?.input.blanks?.[0]?.acceptedAnswers[0],
      ),
    )
    .toEqual(["Parks", "relax"]);
});
