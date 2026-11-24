import { expect, test } from "@playwright/test";
import { ADMIN, API, apiAuth, apiResponse, signIn, TEACHER_2 } from "./support/live";

/**
 * Messages between staff and students (D17, T-R7.24): an announcement a
 * student reads shows the teacher "Seen by 1 of 1"; a student writes to the
 * teacher and the teacher answers; and a direct thread is its two
 * participants' alone, so the Admin's token reads only the Admin's own.
 *
 * Lê Văn Minh and Đào Minh Khang, the only member of Minh's class (seed/11),
 * so "of 1" is the whole class. The seed's own announcement there already
 * reads 1 of 1, so each run asserts on the card with its own text.
 */
const MINH_ID = "01935000-0000-7000-8000-000000000602";
const KHANG = {
  id: "01935000-0000-7000-8000-000001100601",
  email: "khang.dao@quizzivy.com",
  password: "quizzivy-dev",
};
const CLASS_ID = "01935000-0000-7000-8000-000000000621";

test("an announcement the student reads shows the teacher Seen by 1 of 1", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const minhContext = await browser.newContext();
  const khangContext = await browser.newContext();
  try {
    const minh = await minhContext.newPage();
    const khang = await khangContext.newPage();
    const text = `Thứ Bảy này lớp học ở phòng 2 (${Date.now()}).`;

    await signIn(minh, TEACHER_2, /\/teacher$/);
    await minh.goto(`/teacher/messages/class/${CLASS_ID}`);
    const box = minh.getByRole("textbox", { name: /^Viết thông báo tới lớp / });
    await box.fill(text);
    // In a class channel Enter is a new line; only Send posts.
    await box.press("Enter");
    await expect(box).toHaveValue(`${text}\n`);
    const posting = apiResponse(minh, "POST", `/teacher/messages/classes/${CLASS_ID}`);
    await minh.getByRole("button", { name: "Gửi", exact: true }).click();
    const posted = await posting;
    expect(posted.status()).toBe(201);
    const { id } = (await posted.json()) as { id: string };
    const card = minh
      .getByRole("log")
      .locator('[data-slot="announcement"]')
      .filter({ hasText: text });
    await expect(card.getByText("0/1 học viên đã xem", { exact: true })).toBeVisible();

    // Khang opens the channel; his read pointer lands on this post.
    await signIn(khang, KHANG, /\/$/);
    const reading = khang.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/app/messages/classes/${CLASS_ID}/read` &&
        (response.request().postDataJSON() as { lastReadMessageId?: string })
          .lastReadMessageId === id,
    );
    await khang.goto(`/messages/class/${CLASS_ID}`);
    await expect(khang.getByRole("log").getByText(text, { exact: true })).toBeVisible();
    expect((await reading).ok()).toBe(true);
    // Students never post in a channel.
    await expect(khang.getByText("Chỉ giáo viên đăng được ở đây.")).toBeVisible();
    await expect(khang.getByRole("button", { name: "Gửi", exact: true })).toHaveCount(
      0,
    );

    // The teacher's next read of the channel counts him, by number alone.
    await minh.reload();
    await expect(card.getByText("1/1 học viên đã xem", { exact: true })).toBeVisible();
    await expect(card.getByText(/Đào Minh Khang/)).toHaveCount(0);
  } finally {
    await minhContext.close();
    await khangContext.close();
  }
});

test("a student writes to the teacher, the teacher replies, and the Admin's token reads only its own thread", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(120_000);
  const minhContext = await browser.newContext();
  const khangContext = await browser.newContext();
  const api = await playwright.request.newContext();
  try {
    const minh = await minhContext.newPage();
    const khang = await khangContext.newPage();
    const token = String(Date.now());
    const question = `Thầy ơi, em nộp bài tập muộn một ngày được không ạ? (${token})`;
    const reply = `Được em, nhớ nộp trước thứ Sáu nhé. (${token})`;

    await signIn(khang, KHANG, /\/$/);
    await khang.goto(`/messages/teacher/${MINH_ID}`);
    const khangBox = khang.getByRole("textbox", { name: /^Nhắn cho / });
    await khangBox.fill(question);
    const asking = apiResponse(khang, "POST", `/app/messages/teachers/${MINH_ID}`);
    // In a direct thread Enter sends.
    await khangBox.press("Enter");
    expect((await asking).status()).toBe(201);
    await expect(
      khang.getByRole("log").getByText(question, { exact: true }),
    ).toBeVisible();

    await signIn(minh, TEACHER_2, /\/teacher$/);
    await minh.goto(`/teacher/messages/student/${KHANG.id}`);
    await expect(
      minh.getByRole("log").getByText(question, { exact: true }),
    ).toBeVisible();
    const minhBox = minh.getByRole("textbox", { name: /^Nhắn cho / });
    await minhBox.fill(reply);
    const replying = apiResponse(
      minh,
      "POST",
      `/teacher/messages/students/${KHANG.id}`,
    );
    await minhBox.press("Enter");
    expect((await replying).status()).toBe(201);
    await expect(minh.getByRole("log").getByText(reply, { exact: true })).toBeVisible();

    await khang.reload();
    const stream = khang.getByRole("log");
    await expect(stream.getByText(question, { exact: true })).toBeVisible();
    await expect(stream.getByText(reply, { exact: true })).toBeVisible();

    // scope.all never opens another's direct message (D17). Since F2 any
    // staff member may write to any student, so the Admin naming Khang reads
    // the Admin's own thread with him: never Minh's, whose messages it lacks.
    const admin = await apiAuth(api, ADMIN);
    const peeked = await api.get(`${API}/teacher/messages/students/${KHANG.id}`, {
      headers: admin,
    });
    expect(peeked.status()).toBe(200);
    const own = (await peeked.json()) as { messages: { body: string | null }[] };
    expect(own.messages.map((message) => message.body)).not.toContain(question);
    expect(own.messages.map((message) => message.body)).not.toContain(reply);
  } finally {
    await minhContext.close();
    await khangContext.close();
    await api.dispose();
  }
});
