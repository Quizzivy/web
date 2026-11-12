import { storedGroupBundle } from "@tests/support/storedGroupBundle";
import { expect, test } from "@playwright/test";
import { adminUser, sessionAs, stubApi } from "./support/api";
import { paneText, startGroup } from "./support/groupPane";
import { contractJson } from "../support/contractResponse";
import type { components } from "../../src/lib/api/schema";

type Stored = components["schemas"]["StoredQuestionGroup"];

test("a gap's card asks the assistant for wrong options from the sentence in the editor, and adding one saves the gap as a choice", async ({
  page,
}) => {
  const testId = "019535d9-3df7-79fb-b466-fa907fa17fd1";
  const sectionId = "019535d9-3df7-79fb-b466-fa907fa17fd2";
  const stamp = "2026-11-12T00:00:00Z";
  const groups = new Map<string, Stored>();
  const asked: components["schemas"]["AiGapDistractorsRequest"][] = [];
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
    "GET /public/status": { body: { maintenance: null, ai: true } },
    "GET /teacher/ai/usage": {
      body: {
        month: "2026-11-01",
        used: 1200,
        allowance: 20000,
        left: 18800,
        paused: false,
        requests: true,
        pending: null,
        categories: [],
      },
    },
    "POST /teacher/ai/gaps/distractors": async (route) => {
      asked.push(
        route
          .request()
          .postDataJSON() as components["schemas"]["AiGapDistractorsRequest"],
      );
      await route.fulfill({
        json: await contractJson("/teacher/ai/gaps/distractors", "post", 200, {
          items: [
            { text: "work", why: "Người học nghĩ tới việc thường làm." },
            { text: "sleep", why: "Gần nghĩa với nghỉ ngơi." },
          ],
          usage: { credits: 250, left: 18550 },
        }).json(),
      });
    },
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
  const makeGap = page.getByRole("button", { name: "Tạo chỗ trống", exact: true });
  await paneText(page).click();
  await page.keyboard.insertText("Parks are busy. People go there to relax");
  await expect(page.getByText("8 từ", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await expect(makeGap.first()).toBeEnabled();
  await makeGap.last().click();
  const card = page.locator("[data-group-card]").filter({
    has: page.getByRole("heading", { name: "Chỗ trống 1", exact: true }),
  });
  await expect(card).toBeVisible();
  await expect(
    page.getByText("1 chỗ trống · 1 tự điền", { exact: true }),
  ).toBeVisible();

  await card.getByRole("button", { name: "Gợi ý lựa chọn sai", exact: true }).click();
  const panel = card.getByRole("region", { name: "Lựa chọn sai gợi ý", exact: true });
  await expect(panel.getByText("sleep", { exact: true })).toBeVisible();
  expect(asked).toEqual([
    { before: "People go there to ", after: "", answers: ["relax"], options: [] },
  ]);
  await expect(panel.getByText(/250/)).toBeVisible();

  await panel.getByRole("button", { name: "Thêm", exact: true }).first().click();
  await expect(
    panel.getByRole("button", { name: "Đã thêm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 chỗ trống · 1 chọn đáp án", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => latest().bundle.questions[0]?.input.type)
    .toBe("single_choice");
  const saved = latest().bundle;
  expect(
    (saved.questions[0]!.input.options ?? [])
      .map((option) => `${option.text}:${option.isCorrect}`)
      .sort((a, b) => a.localeCompare(b)),
  ).toEqual(["relax:true", "work:false"]);
  expect(saved.group.stimuli[0]!.gaps[0]).toMatchObject({
    kind: "question",
    questionId: saved.questions[0]!.id,
  });

  await panel.getByRole("button", { name: "Đóng gợi ý", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Gợi ý lựa chọn sai", exact: true }),
  ).toBeFocused();
});
