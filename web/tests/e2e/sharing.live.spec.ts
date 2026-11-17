import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  API,
  apiAuth,
  apiResponse,
  assignToClass,
  publishInBuilder,
  signIn,
  startAttempt,
  submitAttempt,
  TEACHER,
  TEACHER_2,
} from "./support/live";

/**
 * Sharing between teachers (D4, T-R7.24), the round trip: A shares a test
 * with B as Can edit; B edits a question A also uses in another test, and the
 * edit forks; B publishes, and A's history names B; A revokes, and B's
 * assignment still grades. It is live because the fork and the scope are the
 * server's, meeting the builder.
 *
 * A is Lê Văn Minh and B Trần Thị Lan (seed/06 and 11). Each run builds its
 * own pair of Minh's tests over a new bank question, so the fork happens on
 * every run against the same database, whatever the seed's own shared tests
 * hold.
 */
const MINH = { id: "01935000-0000-7000-8000-000000000602", name: "Lê Văn Minh" };
const LAN = { id: "01935000-0000-7000-8000-000000000601", name: "Trần Thị Lan" };
/** seed/08: a student of Lan's IELTS 6.5 Evening, with no fixtures of his own here. */
const STUDENT = { email: "thanhtung.ngo@quizzivy.com", password: "quizzivy-dev" };
const CLASSROOM = /IELTS 6\.5 Evening/;

interface Question {
  id: string;
  prompt: string;
  owner: { id: string };
}

interface Outline {
  sections: { questionIds: string[] }[];
}

async function read<T>(
  api: APIRequestContext,
  auth: Record<string, string>,
  path: string,
) {
  const response = await api.get(`${API}${path}`, { headers: auth });
  expect(response.status(), path).toBe(200);
  return (await response.json()) as T;
}

/** A draft test of the caller's holding `questionId` alone, in one part. */
async function testHolding(
  api: APIRequestContext,
  auth: Record<string, string>,
  title: string,
  questionId: string,
): Promise<string> {
  const created = await api.post(`${API}/teacher/tests`, {
    headers: auth,
    data: { title },
  });
  expect(created.status(), `create ${title}`).toBe(201);
  const draft = (await created.json()) as { id: string; updatedAt: string };
  const saved = await api.patch(`${API}/teacher/tests/${draft.id}`, {
    headers: auth,
    data: {
      expectedUpdatedAt: draft.updatedAt,
      sections: [
        { id: null, title: "Phần 1", instructions: null, questionIds: [questionId] },
      ],
    },
  });
  expect(saved.status(), `outline of ${title}`).toBe(200);
  return draft.id;
}

/** The share dialog the test page's header opens, by the test's title. */
function shareDialog(page: Page, title: string) {
  return page.getByRole("dialog", { name: `Chia sẻ “${title}”`, exact: true });
}

test("a test shared as Can edit forks the question it shares, names the co-editor as publisher, and keeps the co-editor's assignment grading after the grant is revoked", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(300_000);
  const api = await playwright.request.newContext();
  const minhAuth = await apiAuth(api, TEACHER_2);
  const lanAuth = await apiAuth(api, TEACHER);

  // ------------------------------------------------------------------ setup
  // Minh's question, in two of his tests; the first is published as v1.
  const token = String(Date.now());
  const prompt = `Kể tên ba con vật sống ở trang trại (${token}).`;
  const created = await api.post(`${API}/teacher/questions`, {
    headers: minhAuth,
    data: {
      type: "short_answer",
      prompt,
      points: 1,
      options: [],
      blanks: [],
      sampleAnswer: "Cows, pigs and hens.",
    },
  });
  expect(created.status()).toBe(201);
  const original = ((await created.json()) as Question).id;
  const title = `Đề chia sẻ ${token}`;
  const sharedId = await testHolding(api, minhAuth, title, original);
  const otherId = await testHolding(
    api,
    minhAuth,
    `Đề khác của Minh ${token}`,
    original,
  );
  const published = await api.post(`${API}/teacher/tests/${sharedId}/publish`, {
    headers: minhAuth,
    data: { changeNote: null },
  });
  expect(published.ok(), "Minh publishes v1").toBe(true);

  const minhContext = await browser.newContext();
  const lanContext = await browser.newContext();
  const studentContext = await browser.newContext();
  try {
    const minh = await minhContext.newPage();
    const lan = await lanContext.newPage();
    const student = await studentContext.newPage();

    // ------------------------------------------ 1. Minh shares as Can edit
    await signIn(minh, TEACHER_2, /\/teacher$/);
    await minh.goto(`/teacher/tests/${sharedId}`);
    await expect(minh.getByRole("heading", { name: title })).toBeVisible();
    await minh.getByRole("button", { name: "Chia sẻ", exact: true }).click();
    const dialog = shareDialog(minh, title);
    await expect(
      dialog.getByText("Chưa chia sẻ với ai.", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("combobox", { name: "Thêm giáo viên theo tên hoặc email" })
      .fill(TEACHER.email);
    await dialog.getByRole("option", { name: new RegExp(LAN.name) }).click();
    await expect(
      dialog.getByRole("button", { name: `Bỏ ${LAN.name}`, exact: true }),
    ).toBeVisible();
    await dialog.getByRole("combobox", { name: "Quyền", exact: true }).click();
    await minh.getByRole("option", { name: "Có thể sửa", exact: true }).click();
    const granting = apiResponse(minh, "POST", "/teacher/shares");
    await dialog.getByRole("button", { name: "Chia sẻ", exact: true }).click();
    expect((await granting).status()).toBe(201);
    await expect(
      minh.getByText("Đã chia sẻ với 1 giáo viên. Họ sẽ nhận được thông báo.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("combobox", { name: `Quyền của ${LAN.name}`, exact: true }),
    ).toHaveText("Có thể sửa");
    await dialog.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(dialog).toBeHidden();

    // ------------------------- 2. Lan edits the question, and the edit forks
    await signIn(lan, TEACHER, /\/teacher$/);
    await lan.goto(`/teacher/tests/${sharedId}/edit`);
    await expect(
      lan.getByText("Thay đổi của bạn được lưu vào bản của Minh.", { exact: true }),
    ).toBeVisible();
    const field = lan.getByRole("textbox", { name: "Nội dung câu hỏi", exact: true });
    await expect(field).toHaveText(prompt);
    const edited = `Kể tên ba con vật sống ở trang trại, bằng tiếng Anh (${token}).`;
    const saving = apiResponse(
      lan,
      "PATCH",
      `/teacher/tests/${sharedId}/questions/${original}`,
    );
    await field.click();
    await field.fill(edited);
    const save = await saving;
    expect(save.status()).toBe(200);
    const edit = (await save.json()) as { forked: boolean; question: Question };
    expect(edit.forked).toBe(true);
    const fork = edit.question.id;
    expect(fork).not.toBe(original);
    await expect(
      lan.getByText(
        "Đã lưu thành một bản sao mới của câu hỏi này, vì Minh đang dùng câu gốc ở nơi khác.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(lan.locator('[role="status"][data-state="saved"]')).toBeVisible({
      timeout: 15_000,
    });

    // Only the shared test moved to the copy, which is Minh's; his other
    // test and his original are as he left them.
    const shared = await read<Outline>(api, minhAuth, `/teacher/tests/${sharedId}`);
    expect(shared.sections.flatMap((section) => section.questionIds)).toEqual([fork]);
    const other = await read<Outline>(api, minhAuth, `/teacher/tests/${otherId}`);
    expect(other.sections.flatMap((section) => section.questionIds)).toEqual([
      original,
    ]);
    expect(
      (await read<Question>(api, minhAuth, `/teacher/questions/${original}`)).prompt,
    ).toBe(prompt);
    const copy = await read<Question>(api, minhAuth, `/teacher/questions/${fork}`);
    expect(copy.prompt).toBe(edited);
    expect(copy.owner.id).toBe(MINH.id);

    // ------------------------ 3. Lan publishes, and Minh's history names her
    await publishInBuilder(lan);
    await minh.goto(`/teacher/tests/${sharedId}`);
    await minh.getByRole("button", { name: "Lịch sử phiên bản" }).click();
    const history = minh.getByRole("dialog", { name: "Lịch sử phiên bản" });
    await expect(
      history.locator('[data-version="2"]').getByText(new RegExp(LAN.name)),
    ).toBeVisible();
    await expect(
      history.locator('[data-version="1"]').getByText(new RegExp(MINH.name)),
    ).toBeVisible();
    await minh.keyboard.press("Escape");
    await expect(history).toBeHidden();

    // Lan assigns v2 to her class.
    await assignToClass(lan, title, `?test=${sharedId}`, CLASSROOM);
    const href = await lan
      .getByRole("row")
      .filter({ hasText: title })
      .getByRole("link", { name: title })
      .getAttribute("href");
    expect(href).toMatch(/^\/teacher\/assignments\/[0-9a-f-]+$/);
    const assignmentId = href!.split("/").at(-1)!;

    // ------------------------------------------------- 4. Minh revokes
    await minh.getByRole("button", { name: "Đã chia sẻ với 1", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: `Dừng chia sẻ với ${LAN.name}`, exact: true })
      .click();
    const revoking = minh.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        new URL(response.url()).pathname.startsWith("/teacher/shares/"),
    );
    await minh.getByRole("button", { name: "Dừng chia sẻ", exact: true }).click();
    expect((await revoking).ok()).toBe(true);
    await expect(
      minh.getByText(`Đã dừng chia sẻ với ${LAN.name}`, { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Chưa chia sẻ với ai.", { exact: true }),
    ).toBeVisible();
    // Lan reaches the test no more.
    expect(
      (
        await api.get(`${API}/teacher/tests/${sharedId}`, { headers: lanAuth })
      ).status(),
    ).toBe(404);

    // ...but her assignment runs: her student hands it in, and she grades it.
    await signIn(student, STUDENT, /\/$/);
    const attemptId = await startAttempt(student, assignmentId);
    await expect(student.getByText(edited, { exact: true })).toBeVisible();
    await student
      .getByRole("textbox", { name: "Bài làm của bạn" })
      .fill("Cows, pigs and ducks.");
    await expect(student.getByText("Đã lưu tất cả câu trả lời")).toBeVisible();
    await submitAttempt(student);

    await lan.goto(`/teacher/attempts/${attemptId}`);
    await lan.getByRole("button", { name: /^Câu 1, / }).click();
    await lan.getByRole("button", { name: "1", exact: true }).click();
    await lan.getByRole("button", { name: "Lưu & câu tiếp theo" }).click();
    const finish = lan.getByRole("button", { name: "Hoàn tất chấm", exact: true });
    await expect(finish).not.toHaveAttribute("aria-disabled", "true", {
      timeout: 15_000,
    });
    await finish.click();
    await expect(
      lan.getByRole("main").getByText("Đã chấm", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await minhContext.close();
    await lanContext.close();
    await studentContext.close();
    await api.dispose();
  }
});
