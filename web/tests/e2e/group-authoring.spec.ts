import { storedGroupBundle } from "@tests/support/storedGroupBundle";
import { expect, test, type Page } from "@playwright/test";
import { adminUser, sessionAs, stubApi } from "./support/api";
import type { components } from "../../src/lib/api/schema";

type Stored = components["schemas"]["StoredQuestionGroup"];
const groupId = "019535d9-3df7-79fb-b466-fa907fa17fa1";
const materialId = "019535d9-3df7-79fb-b466-fa907fa17fa2";
function initial(): Stored {
  return {
    bundle: {
      group: {
        id: groupId,
        title: "Nhóm đọc hiểu",
        instructions: null,
        members: [],
        recordings: [],
        stimuli: [
          {
            id: materialId,
            title: "Bài đọc",
            content: {
              format: "semantic_v1",
              blocks: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Một đoạn văn để biên soạn.", marks: [] },
                  ],
                },
              ],
            },
            gaps: [],
          },
        ],
      },
      questions: [],
    },
    ownerSectionId: null,
    revision: 1,
    archivedAt: null,
    createdAt: "2026-09-24T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
    assets: [],
    unavailableAssetIds: [],
  };
}
async function setup(page: Page) {
  const state = {
    stored: initial(),
    offline: false,
    stale: false,
    writes: 0,
    copies: [] as Stored[],
  };
  await stubApi(page, {
    ...sessionAs(adminUser),
    [`GET /teacher/question-groups/${groupId}`]: (route) =>
      route.fulfill({ json: state.stored }),
    [`PUT /teacher/question-groups/${groupId}`]: (route) => {
      state.writes++;
      if (state.offline)
        return route.fulfill({
          status: 503,
          json: { error: { code: "UNKNOWN", message: "Mất kết nối thử nghiệm" } },
        });
      if (state.stale)
        return route.fulfill({
          status: 409,
          json: { error: { code: "STALE_WRITE", message: "Bản máy chủ đã thay đổi" } },
        });
      const body = route
        .request()
        .postDataJSON() as components["schemas"]["GroupUpdateInput"];
      expect(body.expectedRevision).toBe(state.stored.revision);
      state.stored = {
        ...state.stored,
        bundle: storedGroupBundle(body.bundle),
        revision: state.stored.revision + 1,
      };
      return route.fulfill({ json: state.stored });
    },
    "GET /teacher/question-groups": (route) =>
      route.fulfill({
        json: {
          items: [state.stored, ...state.copies].map((item) => ({
            id: item.bundle.group.id,
            title: item.bundle.group.title,
            revision: item.revision,
            questionCount: item.bundle.questions.length,
            recordingCount: 0,
            totalPoints: item.bundle.questions.length,
            tags: [],
            archivedAt: null,
            updatedAt: item.updatedAt,
          })),
          total: 1 + state.copies.length,
          page: 1,
          pageSize: 20,
        },
      }),
    "POST /teacher/question-groups": async (route) => {
      const body = route
        .request()
        .postDataJSON() as components["schemas"]["GroupCreateInput"];
      const copy = { ...initial(), bundle: storedGroupBundle(body.bundle) };
      state.copies.push(copy);
      await page.route(
        `http://localhost:8080/teacher/question-groups/${copy.bundle.group.id}`,
        (read) => read.fulfill({ json: copy }),
      );
      return route.fulfill({ status: 201, json: copy });
    },
    "GET /teacher/questions": {
      body: {
        items: [],
        total: 0,
        bankTotal: 0,
        facets: {},
        tags: [],
        page: 1,
        pageSize: 20,
      },
    },
    "POST /auth/logout": { status: 204 },
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`/teacher/question-bank/groups/${groupId}`);
  await expect(page.getByRole("textbox", { name: "Tiêu đề", exact: true })).toHaveValue(
    "Nhóm đọc hiểu",
  );
  return state;
}

async function records(page: Page) {
  return page.evaluate(readRecordsInBrowser);
}
function readRecordsInBrowser() {
  return new Promise<
    {
      owner: string;
      item: string;
      token: string;
      createdAt: number;
      expiresAt: number;
      payload: unknown;
    }[]
  >((resolve, reject) => {
    const request = indexedDB.open("quizzivy-authoring-drafts", 1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("drafts", "readonly");
      const read = transaction.objectStore("drafts").getAll();
      read.onsuccess = () =>
        resolve(
          read.result as {
            owner: string;
            item: string;
            token: string;
            createdAt: number;
            expiresAt: number;
            payload: unknown;
          }[],
        );
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

test("offline edits recover after reload and flush before leaving without resetting the active editor", async ({
  page,
}) => {
  const state = await setup(page);
  state.offline = true;
  await page
    .getByRole("textbox", { name: "Tiêu đề", exact: true })
    .fill("Bản nháp riêng");
  await expect(
    page.getByText("Chưa đồng bộ · Đã lưu bản nháp trên máy", { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await expect.poll(() => state.writes).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole("button", { name: "Khôi phục bản nháp", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Tiêu đề", exact: true })).toHaveValue(
    "Bản nháp riêng",
  );
  state.offline = false;
  const material = page.getByRole("textbox", { name: "Đoạn văn", exact: true });
  await material.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Nội dung mới có dấu tiếng Việt.");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Bài đọc, điền từ, bài nghe", exact: true })
    .click();
  await page.getByRole("button", { name: "Lưu và rời trang", exact: true }).click();
  await expect(page).toHaveURL(/question-bank\/groups$/);
  expect(state.stored.bundle.group.title).toBe("Bản nháp riêng");
  expect(JSON.stringify(state.stored.bundle.group.stimuli)).toContain(
    "Nội dung mới có dấu tiếng Việt.",
  );
  await expect.poll(async () => (await records(page)).length).toBe(0);
});

test("stale edits remain editable and recover as an independent group", async ({
  page,
}) => {
  const state = await setup(page);
  state.stale = true;
  await page
    .getByRole("textbox", { name: "Tiêu đề", exact: true })
    .fill("Nhóm cần khôi phục");
  await expect(
    page.getByText("Bài này đã thay đổi ở nơi khác", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Một đáp án", exact: true }).click();
  await page.getByRole("button", { name: "Lưu thành bài mới", exact: true }).click();
  await expect.poll(() => state.copies.length).toBe(1);
  expect(state.copies[0]!.bundle.group.id).not.toBe(groupId);
  expect(state.copies[0]!.bundle.group.stimuli[0]!.id).not.toBe(materialId);
  expect(state.copies[0]!.bundle.questions).toHaveLength(1);
  expect(state.stored.bundle.group.title).toBe("Nhóm đọc hiểu");
  await expect.poll(async () => (await records(page)).length).toBe(0);
});

test("the passage and an open question keep their text across the pane's tabs at narrow widths", async ({
  page,
}) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 768, height: 900 });
  const passage = page.getByRole("tab", { name: "Bài đọc", exact: true });
  await passage.click();
  const material = page.getByRole("textbox", { name: "Đoạn văn", exact: true });
  await material.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Nội dung dùng chung");
  await page.getByRole("tab", { name: "Câu hỏi · 0", exact: true }).click();
  await expect(material).toBeHidden();
  await page.getByRole("button", { name: "Một đáp án", exact: true }).click();
  const prompt = page.getByRole("textbox", { name: "Nội dung câu hỏi", exact: true });
  await prompt.click();
  await expect(prompt).toHaveText("");
  await prompt.fill("Câu hỏi đầu tiên");
  await passage.click();
  await expect(material).toHaveText("Nội dung dùng chung");
  await page.getByRole("tab", { name: "Câu hỏi · 1", exact: true }).click();
  await expect(prompt).toHaveText("Câu hỏi đầu tiên");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText("Đã lưu trên máy chủ", { exact: true })).toBeVisible();
  expect(state.stored.bundle.questions[0]!.input.prompt).toBe("Câu hỏi đầu tiên");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("expired drafts are removed and another account cannot restore a local draft", async ({
  page,
}) => {
  const state = await setup(page);
  state.offline = true;
  await page
    .getByRole("textbox", { name: "Tiêu đề", exact: true })
    .fill("Nội dung riêng");
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open("quizzivy-authoring-drafts", 1);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("drafts", "readwrite");
          const store = transaction.objectStore("drafts");
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            entry.update({ ...entry.value, expiresAt: Date.now() - 1 });
            entry.continue();
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Tiêu đề", exact: true })).toHaveValue(
    "Nhóm đọc hiểu",
  );
  await expect.poll(async () => (await records(page)).length).toBe(0);
  await page.getByRole("textbox", { name: "Tiêu đề", exact: true }).fill("Tài khoản A");
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.route("http://localhost:8080/auth/me", (route) =>
    route.fulfill({
      json: { ...adminUser, id: "019535d9-3df7-79fb-b466-fa907fa17fb1" },
    }),
  );
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Tiêu đề", exact: true })).toHaveValue(
    "Nhóm đọc hiểu",
  );
  await expect(
    page.getByRole("button", { name: "Khôi phục bản nháp", exact: true }),
  ).toHaveCount(0);
});

test("logout clears local drafts and fences a stale writer in another tab", async ({
  page,
  context,
}) => {
  const state = await setup(page);
  state.offline = true;
  await page
    .getByRole("textbox", { name: "Tiêu đề", exact: true })
    .fill("Chưa đồng bộ");
  await expect.poll(async () => (await records(page)).length).toBe(1);
  const other = await context.newPage();
  await stubApi(other, {
    ...sessionAs(adminUser),
    "POST /auth/logout": { status: 204 },
  });
  await other.goto("/teacher/settings");
  await other.getByRole("button", { name: /Tài khoản/ }).click();
  await other.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
  await expect(other).toHaveURL(/\/login(?:\?|$)/);
  await expect.poll(async () => (await records(page)).length).toBe(0);
  await page
    .getByRole("textbox", { name: "Tiêu đề", exact: true })
    .fill("Tab cũ vẫn đang mở");
  await expect(page.getByText(/Chưa đồng bộ · Không lưu được bản nháp/)).toBeVisible();
  expect(await records(page)).toHaveLength(0);
});

test("a selected word becomes a gap with its question, which removing and undoing take away and bring back", async ({
  page,
}) => {
  const state = await setup(page);
  const imageId = "019535d9-3df7-79fb-b466-fa907fa17fa3";
  await page.route("http://localhost:8080/teacher/media?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: imageId,
            kind: "image",
            mimeType: "image/png",
            bytes: 120,
            durationMs: null,
            originalFilename: "diagram.png",
            createdAt: "2026-09-24T00:00:00Z",
            url: "http://localhost:4173/synthetic-diagram.png",
            usedInVersions: 0,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      },
    }),
  );
  await page.route("**/synthetic-diagram.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  const saved = page.getByText("Đã lưu trên máy chủ", { exact: true });
  const save = page.getByRole("button", { name: "Lưu", exact: true });
  const material = page.getByRole("textbox", { name: "Đoạn văn", exact: true });
  const makeGap = page.getByRole("button", { name: "Tạo chỗ trống", exact: true });
  await expect(makeGap.first()).toBeDisabled();
  await material.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" parks");
  await expect(page.getByText("7 từ", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await expect(makeGap.first()).toBeEnabled();
  await expect(makeGap).toHaveCount(2);
  await makeGap.last().click();

  const card = page.locator("[data-group-card]").filter({
    has: page.getByRole("heading", { name: "Chỗ trống 1", exact: true }),
  });
  await expect(card.getByText(/học viên sẽ tự điền từ này/)).toBeVisible();
  const rows = card.getByRole("textbox", { name: /^Lựa chọn [A-D]$/ });
  await expect(rows).toHaveCount(4);
  await expect(card.locator('input[value="parks"]')).toHaveCount(1);
  await expect(
    material.getByLabel("Chỗ trống 1: parks", { exact: true }),
  ).toBeVisible();
  await save.click();
  await expect(saved).toBeVisible();
  const typed = state.stored.bundle.questions[0]!;
  expect(typed.input.type).toBe("fill_blank");
  expect(typed.input.blanks?.[0]?.acceptedAnswers).toEqual(["parks"]);
  expect(state.stored.bundle.group.stimuli[0]!.gaps[0]).toMatchObject({
    kind: "blank",
    questionId: typed.id,
  });

  await card.locator('input[value=""][aria-label^="Lựa chọn"]').first().fill("streets");
  await expect(card.getByText(/học viên sẽ tự điền từ này/)).toHaveCount(0);
  await save.click();
  await expect(saved).toBeVisible();
  const chosen = state.stored.bundle.questions[0]!;
  expect(chosen.id).toBe(typed.id);
  expect(chosen.input.type).toBe("single_choice");
  expect(chosen.input.options?.map((option) => option.text).sort()).toEqual([
    "parks",
    "streets",
  ]);
  expect(state.stored.bundle.group.stimuli[0]!.gaps[0]).toMatchObject({
    kind: "question",
    questionId: typed.id,
  });

  await card.getByRole("button", { name: "Thao tác với câu hỏi", exact: true }).click();
  await page.getByRole("menuitem", { name: "Bỏ chỗ trống", exact: true }).click();
  const removed = page.getByText("Đã bỏ chỗ trống 1. Từ “parks” đã trở lại đoạn văn.");
  await expect(removed).toBeVisible();
  await expect(material).toContainText("parks");
  await expect(material.getByLabel("Chỗ trống 1: parks", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator("[data-group-card]")).toHaveCount(0);
  await page
    .locator("[data-sonner-toast]")
    .getByRole("button", { name: "Hoàn tác", exact: true })
    .click();
  await expect(
    material.getByLabel("Chỗ trống 1: parks", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-group-card]")).toHaveCount(1);
  await save.click();
  await expect(saved).toBeVisible();
  expect(state.stored.bundle.questions.map((question) => question.id)).toEqual([
    typed.id,
  ]);

  await material.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Hình ảnh", exact: true }).click();
  await page.getByRole("button", { name: /diagram.png/ }).click();
  await page.getByLabel("Mô tả hình ảnh", { exact: true }).fill("Sơ đồ bài đọc");
  await page.getByRole("button", { name: "Chèn vào đoạn văn", exact: true }).click();
  await expect(material).toContainText("Sơ đồ bài đọc");
  await page
    .getByRole("toolbar")
    .getByRole("button", { name: /^Hoàn tác/ })
    .click();
  await expect(material).not.toContainText("Sơ đồ bài đọc");
  await save.click();
  await expect(saved).toBeVisible();
  expect(JSON.stringify(state.stored.bundle)).not.toContain(imageId);
  expect(state.stored.bundle.questions).toHaveLength(1);

  await page.getByRole("button", { name: "Xem như học viên", exact: true }).click();
  await page.getByRole("radio", { name: "Điện thoại", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Chỗ trống 1 — chuyển đến câu 1" }),
  ).toBeVisible();
  await expect(page.locator('[data-preview-viewport="phone"]')).toHaveCSS(
    "width",
    "320px",
  );
});

test("signing out from an unsaved group is not trapped by its leave guard", async ({
  page,
}) => {
  const state = await setup(page);
  state.offline = true;
  await page
    .getByRole("textbox", { name: "Tiêu đề", exact: true })
    .fill("Thoát khi đang sửa");
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.getByRole("button", { name: /Tài khoản/ }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect.poll(async () => (await records(page)).length).toBe(0);
  await expect(
    page.getByRole("dialog", { name: "Chỉnh sửa chưa được đồng bộ", exact: true }),
  ).toHaveCount(0);
});
