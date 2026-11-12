import { expect, test, type Page } from "@playwright/test";
import { adminUser, sessionAs, stubApi } from "./support/api";
import type { components } from "../../src/lib/api/schema";

const TEST_ID = "018f0000-0000-7000-8000-0000000002a1";
const SECTION_ID = "018f0000-0000-7000-8000-0000000002c1";
const GROUP_ID = "018f0000-0000-7000-8000-0000000002d1";
const STAMP = "2026-10-01T00:00:00Z";

const PROMPTS = [
  "According to the passage, what is one advantage of living close to the city centre for young professionals?",
  "Which reason does the writer give for the rising cost of renting a flat near the underground stations?",
  "What does the author suggest about commuting times for families who moved to the suburbs last decade?",
  "Why do some residents prefer the quieter neighbourhoods on the far side of the river, in the writer's view?",
  "What is the main purpose of the third paragraph, which compares two very different housing schemes?",
  "Which statement best summarises the council's plan for building affordable homes over the next ten years?",
  "What does the phrase 'a double-edged sword' refer to in the paragraph about new transport links?",
  "According to the final paragraph, what will most probably happen to house prices once the bridge opens?",
];
const OPTIONS = [
  "Houses are cheaper",
  "Offices are closer",
  "Schools are better funded and the classes are noticeably smaller",
  "Parks are larger",
];

function memberId(index: number) {
  return `018f0000-0000-7000-8000-0000000003${String(index).padStart(2, "0")}`;
}

const group: components["schemas"]["StoredQuestionGroup"] = {
  bundle: {
    group: {
      id: GROUP_ID,
      title: "Reading Passage 1 — Living in the city centre or the suburbs",
      instructions: null,
      members: PROMPTS.map((_, index) => ({
        questionId: memberId(index),
        optionOrder: "shuffle" as const,
      })),
      stimuli: [
        {
          id: "018f0000-0000-7000-8000-0000000002e1",
          title: "Bài đọc",
          content: {
            format: "semantic_v1",
            blocks: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Many young professionals now choose to live close to the city centre, even though the flats there are small and expensive.",
                    marks: [],
                  },
                ],
              },
            ],
          },
          gaps: [],
        },
      ],
      recordings: [],
    },
    questions: PROMPTS.map((prompt, index) => ({
      id: memberId(index),
      input: {
        type: "single_choice" as const,
        level: null,
        skill: null,
        prompt,
        promptContent: null,
        options: OPTIONS.map((text, ordinal) => ({
          id: null,
          text,
          isCorrect: ordinal === 1,
        })),
        blanks: [],
        points: 1,
        explanation: null,
        sampleAnswer: null,
        tags: [],
      },
    })),
  },
  ownerSectionId: SECTION_ID,
  revision: 1,
  testUpdatedAt: STAMP,
  archivedAt: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  assets: [],
  unavailableAssetIds: [],
};

const draft: components["schemas"]["Test"] = {
  skills: [],
  assignments: { live: 0, scheduled: 0, closed: 0 },
  unpublishedChanges: null,
  id: TEST_ID,
  title: "Đề thi chưa đặt tên",
  description: null,
  status: "draft",
  currentVersion: 0,
  nextVersion: 1,
  totalPoints: PROMPTS.length,
  questionCount: PROMPTS.length,
  audioCount: 0,
  sections: [
    {
      id: SECTION_ID,
      ordinal: 0,
      title: "Phần 1",
      instructions: null,
      questionIds: [],
      units: [{ kind: "group", id: GROUP_ID }],
    },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
};

async function openGroupMember(
  page: Page,
  width: number,
  height: number,
  sidebar: "expanded" | "collapsed" = "expanded",
) {
  await stubApi(page, {
    ...sessionAs(adminUser),
    [`GET /teacher/tests/${TEST_ID}`]: { body: draft },
    [`GET /teacher/question-groups/${GROUP_ID}`]: { body: group },
  });
  if (sidebar === "collapsed")
    await page.addInitScript(() =>
      localStorage.setItem("quizzivy.sidebar", "collapsed"),
    );
  await page.setViewportSize({ width, height });
  await page.goto(`/teacher/tests/${TEST_ID}/edit`);
  await page
    .locator(`[data-outline-group="${GROUP_ID}"]`)
    .getByText(PROMPTS[0]!.slice(0, 30))
    .click();
  await expect(
    page.getByRole("textbox", { name: "Lựa chọn D", exact: true }),
  ).toHaveValue(OPTIONS[3]!);
}

function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const main = document.querySelector("main")!;
    const insideScroller = (element: Element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (node === main || node === document.body) return false;
        const box = node.getBoundingClientRect();
        if (
          getComputedStyle(node).overflowX !== "visible" &&
          box.left >= 0 &&
          box.right <= viewport
        )
          return true;
      }
      return false;
    };
    const past = [...document.body.querySelectorAll("*")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          (box.left < -0.5 || box.right > viewport + 0.5) &&
          !insideScroller(element)
        );
      })
      .slice(0, 5)
      .map((element) => element.outerHTML.slice(0, 160));
    return {
      document: document.documentElement.scrollWidth - viewport,
      main: main.scrollWidth - main.clientWidth,
      mainScrolledBy: main.scrollLeft,
      past,
    };
  });
}

const NONE = { document: 0, main: 0, mainScrolledBy: 0, past: [] };

const paneTab = (page: Page) => page.getByRole("tab", { name: "Bài đọc", exact: true });
const material = (page: Page) =>
  page.getByRole("region", { name: "Bài đọc", exact: true });
const questions = (page: Page) =>
  page.getByRole("region", { name: "Câu hỏi của bài đọc", exact: true });

for (const [width, height] of [
  [393, 852],
  [360, 800],
] as const) {
  test(`a group's pane is two tabs on a ${width}px phone, and nothing scrolls the page sideways`, async ({
    page,
  }) => {
    await openGroupMember(page, width, height);
    await expect(
      page.getByRole("tab", { name: `Câu hỏi · ${PROMPTS.length}`, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(material(page)).toBeHidden();
    expect(await horizontalOverflow(page)).toEqual(NONE);

    await page.getByRole("textbox", { name: "Lựa chọn C", exact: true }).focus();
    await page.locator("#question-prompt").focus();
    expect(await horizontalOverflow(page)).toEqual(NONE);

    await paneTab(page).click();
    await expect(material(page)).toBeVisible();
    await expect(questions(page)).toBeHidden();
    await expect(
      material(page).getByRole("button", { name: "Tạo chỗ trống", exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual(NONE);
  });
}

test("at 1024px with the sidebar expanded the pane is too narrow for two halves and shows its tabs", async ({
  page,
}) => {
  await openGroupMember(page, 1024, 768);
  await expect(paneTab(page)).toBeVisible();
  await expect(material(page)).toBeHidden();
  await expect(questions(page)).toBeVisible();
  expect(await horizontalOverflow(page)).toEqual(NONE);
});

for (const [width, height] of [
  [1280, 900],
  [1440, 900],
] as const) {
  test(`at ${width}px the passage stays beside its questions`, async ({ page }) => {
    await openGroupMember(page, width, height);
    await expect(paneTab(page)).toHaveCount(0);
    const left = (await material(page).boundingBox())!;
    const right = (await questions(page).boundingBox())!;
    expect(left.x + left.width).toBeLessThanOrEqual(right.x);
    expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1);
    await expect(
      material(page).getByText("Many young professionals", { exact: false }),
    ).toBeVisible();
    await expect(
      questions(page).getByRole("heading", { name: "Câu 1", exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual(NONE);
  });
}

test("the halves become tabs as the window narrows, and come back", async ({
  page,
}) => {
  await openGroupMember(page, 1280, 900);
  await expect(material(page)).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(paneTab(page)).toBeVisible();
  await expect(material(page)).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(paneTab(page)).toHaveCount(0);
  await expect(material(page)).toBeVisible();
});
