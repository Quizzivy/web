import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, apiResponse, signIn, TEACHER, TEACHER_2 } from "./support/live";

/**
 * F2's messages on the real API (T-F2.9, api seed/14): the Admin writes to a
 * student of Lan's class, who reads "Giáo viên của trung tâm" and replies; Lan
 * writes to Diệp, a student in no class; and Lan and Minh, two teachers,
 * exchange a message with a PDF that Minh downloads, after which his unread
 * count is what it was.
 *
 * Bùi Ngọc Mai (seed/08) is only in Lan's IELTS 6.5 Evening and was never
 * taught by the Admin; Hồ Ngọc Diệp (seed/14) is in no class and nobody's
 * peer. No other live spec signs either in. A run leaves its messages behind,
 * so every check reads this run's own text, never a count from zero.
 */
const ADMIN_ID = "01935000-0000-7000-8000-0000000000a1";
const LAN_ID = "01935000-0000-7000-8000-000000000601";
const MINH_ID = "01935000-0000-7000-8000-000000000602";
const MAI = {
  id: "01935000-0000-7000-8000-000000800109",
  name: "Bùi Ngọc Mai",
  email: "ngocmai.bui@quizzivy.com",
  password: "quizzivy-dev",
};
const DIEP = {
  id: "01935000-0000-7000-8000-000001400101",
  name: "Hồ Ngọc Diệp",
  email: "diep.ho@quizzivy.com",
  password: "quizzivy-dev",
};

/** A one-page PDF the spec uploads itself: the seed's PDF row has no object in the store. */
function onePagePdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** openPicker opens New message on the staff Messages page. */
async function openPicker(page: Page) {
  await page
    .getByRole("main")
    .getByRole("button", { name: "Tin nhắn mới", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Tin nhắn mới" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** expectUnread waits for the staff sidebar's Messages count to read `count`, none for 0. */
async function expectUnread(page: Page, count: number) {
  const link = page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("link", { name: /^Tin nhắn/ });
  if (count === 0) await expect(link).toHaveAccessibleName("Tin nhắn");
  else
    await expect(link).toHaveAccessibleName(
      new RegExp(`^Tin nhắn.*${count} tin nhắn chưa đọc$`),
    );
}

test("the Admin writes to a student of Lan's class, who reads “Giáo viên của trung tâm” and replies", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const adminContext = await browser.newContext();
  const maiContext = await browser.newContext();
  try {
    const admin = await adminContext.newPage();
    const mai = await maiContext.newPage();
    const token = String(Date.now());
    const hello = `Chào Mai, trung tâm gửi em lịch thi thử tháng 12. (${token})`;
    const reply = `Dạ em cảm ơn ạ, em đã xem lịch. (${token})`;

    await signIn(admin, ADMIN, /\/(admin|teacher)$/);
    await admin.goto("/teacher/messages");
    const dialog = await openPicker(admin);
    await dialog.getByRole("combobox", { name: "Tìm theo tên" }).fill("ngoc mai");
    const row = dialog.getByRole("option").filter({ hasText: MAI.name });
    // Not a student of the Admin's: her class is named, not the Admin's.
    await expect(row).toContainText("IELTS 6.5 Evening");
    await row.click();
    await expect(admin).toHaveURL(`/teacher/messages/student/${MAI.id}`);
    const adminBox = admin.getByRole("textbox", { name: /^Nhắn cho / });
    await expect(adminBox).toBeFocused();
    await adminBox.fill(hello);
    const posting = apiResponse(admin, "POST", `/teacher/messages/students/${MAI.id}`);
    await adminBox.press("Enter");
    expect((await posting).status()).toBe(201);
    await expect(
      admin.getByRole("log").getByText(hello, { exact: true }),
    ).toBeVisible();

    // Mai reads the Admin as a teacher at the centre, in the list and the thread.
    await signIn(mai, MAI, /\/$/);
    await mai.goto("/messages");
    const listed = mai
      .getByRole("complementary", { name: "Cuộc trò chuyện" })
      .locator(`a[href="/messages/teacher/${ADMIN_ID}"]`);
    await expect(listed).toContainText("Giáo viên của trung tâm");
    await listed.click();
    await expect(mai).toHaveURL(`/messages/teacher/${ADMIN_ID}`);
    const thread = mai.getByRole("region").filter({ has: mai.getByRole("log") });
    await expect(
      thread.getByText("Giáo viên của trung tâm", { exact: true }),
    ).toBeVisible();
    await expect(mai.getByRole("log").getByText(hello, { exact: true })).toBeVisible();
    const maiBox = mai.getByRole("textbox", { name: /^Nhắn cho / });
    await maiBox.fill(reply);
    const replying = apiResponse(mai, "POST", `/app/messages/teachers/${ADMIN_ID}`);
    await maiBox.press("Enter");
    expect((await replying).status()).toBe(201);
    await expect(mai.getByRole("log").getByText(reply, { exact: true })).toBeVisible();

    await admin.reload();
    await expect(
      admin.getByRole("log").getByText(reply, { exact: true }),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await maiContext.close();
  }
});

test("Lan writes to Diệp, a student in no class, who reads it", async ({ browser }) => {
  test.setTimeout(120_000);
  const lanContext = await browser.newContext();
  const diepContext = await browser.newContext();
  try {
    const lan = await lanContext.newPage();
    const diep = await diepContext.newPage();
    const text = `Chào Diệp, tuần sau em vào lớp IELTS Foundation A nhé. (${Date.now()})`;

    await signIn(lan, TEACHER, /\/teacher$/);
    await lan.goto("/teacher/messages");
    const dialog = await openPicker(lan);
    await dialog.getByRole("combobox", { name: "Lọc học viên" }).click();
    await lan.getByRole("option", { name: "Chưa vào lớp nào", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Tìm theo tên" }).fill("Diệp");
    const row = dialog.getByRole("option").filter({ hasText: DIEP.name });
    await expect(row).toContainText("Chưa vào lớp nào");
    await row.click();
    await expect(lan).toHaveURL(`/teacher/messages/student/${DIEP.id}`);
    const box = lan.getByRole("textbox", { name: /^Nhắn cho / });
    await expect(box).toBeFocused();
    await box.fill(text);
    const posting = apiResponse(lan, "POST", `/teacher/messages/students/${DIEP.id}`);
    await box.press("Enter");
    expect((await posting).status()).toBe(201);
    await expect(lan.getByRole("log").getByText(text, { exact: true })).toBeVisible();

    await signIn(diep, DIEP, /\/$/);
    await diep.goto(`/messages/teacher/${LAN_ID}`);
    await expect(diep.getByRole("log").getByText(text, { exact: true })).toBeVisible();
    await expect(
      diep.getByRole("region").getByText("Giáo viên của trung tâm", { exact: true }),
    ).toBeVisible();
  } finally {
    await lanContext.close();
    await diepContext.close();
  }
});

test("Lan and Minh exchange a message with a PDF; Minh downloads it and his unread count clears", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const lanContext = await browser.newContext();
  const minhContext = await browser.newContext({ acceptDownloads: true });
  try {
    const lan = await lanContext.newPage();
    const minh = await minhContext.newPage();
    const token = String(Date.now());
    const filename = `Bài mẫu Speaking ${token}.pdf`;
    const pdf = onePagePdf(`Speaking Part 2 sample ${token}`);
    const note = `Em xem thử bài mẫu này nhé. (${token})`;
    const thanks = `Dạ em cảm ơn chị. (${token})`;

    // His count before Lan writes, as the sidebar's first summary reads it.
    const summarised = apiResponse(minh, "GET", "/teacher/summary");
    await signIn(minh, TEACHER_2, /\/teacher$/);
    const { unreadMessages: before } = (await (await summarised).json()) as {
      unreadMessages: number;
    };
    await expectUnread(minh, before);

    // Lan opens the seeded thread from the Colleagues tab and sends the file.
    await signIn(lan, TEACHER, /\/teacher$/);
    await lan.goto("/teacher/messages");
    const lanList = lan.getByRole("complementary", { name: "Cuộc trò chuyện" });
    await lanList
      .getByRole("group", { name: "Lọc cuộc trò chuyện" })
      .getByRole("button", { name: /^Đồng nghiệp/ })
      .click();
    await lanList.getByRole("link").filter({ hasText: "Lê Văn Minh" }).click();
    await expect(lan).toHaveURL(`/teacher/messages/colleagues/${MINH_ID}`);
    await expect(
      lan.getByRole("log").getByText("Thẻ gợi ý Speaking Part 2.pdf", { exact: true }),
    ).toBeVisible();
    await lan.getByRole("button", { name: "Đính kèm tệp", exact: true }).click();
    const attach = lan.getByRole("dialog", { name: "Đính kèm tệp" });
    const uploading = apiResponse(lan, "POST", "/teacher/messages/attachments");
    await attach
      .locator('input[type="file"]')
      .setInputFiles({ name: filename, mimeType: "application/pdf", buffer: pdf });
    expect((await uploading).status()).toBe(201);
    await attach.getByRole("button", { name: "Đính kèm", exact: true }).click();
    await expect(attach).toBeHidden();
    const lanBox = lan.getByRole("textbox", { name: /^Nhắn cho / });
    await lanBox.fill(note);
    const posting = apiResponse(lan, "POST", `/teacher/messages/colleagues/${MINH_ID}`);
    await lan.getByRole("button", { name: "Gửi", exact: true }).click();
    const posted = await posting;
    expect(posted.status()).toBe(201);
    expect(
      ((await posted.json()) as { attachment: { filename: string } | null }).attachment
        ?.filename,
    ).toBe(filename);

    // Minh's count rises by one, and his Colleagues tab carries it.
    await minh.reload();
    await expectUnread(minh, before + 1);
    await minh.goto("/teacher/messages");
    const minhList = minh.getByRole("complementary", { name: "Cuộc trò chuyện" });
    const tab = minhList
      .getByRole("group", { name: "Lọc cuộc trò chuyện" })
      .getByRole("button", { name: /^Đồng nghiệp/ });
    await expect(tab).toContainText("1");
    await tab.click();
    const lanRow = minhList.getByRole("link").filter({ hasText: "Trần Thị Lan" });
    await expect(lanRow).toContainText("1 tin nhắn chưa đọc");

    // He opens it, reads the note, downloads the file; the counts clear.
    const reading = minh.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/teacher/messages/colleagues/${LAN_ID}/read`,
    );
    await lanRow.click();
    await expect(minh).toHaveURL(`/teacher/messages/colleagues/${LAN_ID}`);
    const stream = minh.getByRole("log");
    await expect(stream.getByText(note, { exact: true })).toBeVisible();
    expect((await reading).status()).toBe(204);
    const downloading = minh.waitForEvent("download");
    await stream.getByRole("button", { name: `Tải xuống ${filename}` }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(filename);
    const saved = await readFile(await download.path());
    expect(sha256(saved)).toBe(sha256(pdf));
    await expectUnread(minh, before);
    await expect(tab).not.toContainText("1");
    await expect(lanRow).not.toContainText("tin nhắn chưa đọc");

    // He answers; Lan's thread shows it.
    const minhBox = minh.getByRole("textbox", { name: /^Nhắn cho / });
    await minhBox.fill(thanks);
    const answering = apiResponse(
      minh,
      "POST",
      `/teacher/messages/colleagues/${LAN_ID}`,
    );
    await minhBox.press("Enter");
    expect((await answering).status()).toBe(201);
    await lan.reload();
    await expect(lan.getByRole("log").getByText(thanks, { exact: true })).toBeVisible();
  } finally {
    await lanContext.close();
    await minhContext.close();
  }
});
