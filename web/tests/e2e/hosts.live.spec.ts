import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { STAFF_HOST, STUDENT_HOST } from "./support/hosts";
import { ADMIN, setPasswordLink, STUDENT, TEACHER } from "./support/live";

/**
 * The two web hosts against the real API (§5.8). What only the two halves
 * together can show is the session: the API reads the browser's Origin, keeps
 * one refresh cookie per host on its own host, and admits an account only
 * where it belongs. The stubbed suite cannot hold a cookie, and the API's own
 * tests have no browser to send an Origin.
 */

const API = "http://localhost:8080";
const STUDENT_COOKIE = "quizzivy_refresh_student";
const STAFF_COOKIE = "quizzivy_refresh_staff";

async function submitSignIn(page: Page, host: string, who: typeof ADMIN) {
  await page.goto(`${host}/login`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

async function refreshCookies(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies(`${API}/auth/refresh`);
  return cookies
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith("quizzivy_refresh"))
    .sort((a, b) => a.localeCompare(b));
}

const account = (page: Page) => page.getByRole("button", { name: /^Tài khoản của/ });

test("one browser holds a student session and a staff session, and signing out of one leaves the other", async ({
  context,
}) => {
  const student = await context.newPage();
  const staff = await context.newPage();

  await submitSignIn(student, STUDENT_HOST, STUDENT);
  await expect(student).toHaveURL(`${STUDENT_HOST}/`);
  await submitSignIn(staff, STAFF_HOST, TEACHER);
  await expect(staff).toHaveURL(`${STAFF_HOST}/teacher`);
  expect(await refreshCookies(context)).toEqual([STAFF_COOKIE, STUDENT_COOKIE]);

  // The access token lives in memory, so a reload is the refresh cookie at
  // work: each host restores its own account from its own cookie.
  await student.reload();
  await expect(student).toHaveURL(`${STUDENT_HOST}/`);
  await expect(account(student)).toBeVisible();
  await staff.reload();
  await expect(staff).toHaveURL(`${STAFF_HOST}/teacher`);
  await expect(
    staff.getByRole("navigation", { name: "Điều hướng chính" }),
  ).toBeVisible();

  await account(student).click();
  await student.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(student).toHaveURL(`${STUDENT_HOST}/login`);
  await expect.poll(() => refreshCookies(context)).toEqual([STAFF_COOKIE]);

  await staff.reload();
  await expect(staff).toHaveURL(`${STAFF_HOST}/teacher`);
  await expect(
    staff.getByRole("navigation", { name: "Điều hướng chính" }),
  ).toBeVisible();
  await student.goto(`${STUDENT_HOST}/classes`);
  await expect(student).toHaveURL(`${STUDENT_HOST}/login?next=%2Fclasses`);
});

test("an account is turned away at the other host, told where it signs in, and signs in there", async ({
  page,
  context,
}) => {
  await submitSignIn(page, STAFF_HOST, STUDENT);
  await expect(page.getByRole("alert")).toContainText(
    "Đây là tài khoản học viên. Hãy đăng nhập tại localhost:4174.",
  );
  await expect(page).toHaveURL(`${STAFF_HOST}/login`);
  expect(await refreshCookies(context)).toEqual([]);

  await page
    .getByRole("link", { name: "Mở trang đăng nhập của localhost:4174" })
    .click();
  await expect(page).toHaveURL(`${STUDENT_HOST}/login`);
  await page.getByLabel("Email").fill(STUDENT.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(STUDENT.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(`${STUDENT_HOST}/`);
  expect(await refreshCookies(context)).toEqual([STUDENT_COOKIE]);

  const other = await context.newPage();
  await submitSignIn(other, STUDENT_HOST, TEACHER);
  await expect(other.getByRole("alert")).toContainText(
    "Tài khoản này dành cho giáo viên và quản trị viên. Hãy đăng nhập tại localhost:4175.",
  );
  await expect(
    other.getByRole("link", { name: "Mở trang đăng nhập của localhost:4175" }),
  ).toHaveAttribute("href", `${STAFF_HOST}/login`);
  expect(await refreshCookies(context)).toEqual([STUDENT_COOKIE]);
});

async function addUser(owner: Page, name: string, email: string, role: string) {
  await owner.goto(`${STAFF_HOST}/admin/users`);
  await owner.getByRole("button", { name: "Thêm người dùng", exact: true }).click();
  const add = owner.getByRole("dialog", { name: "Thêm người dùng" });
  await add.getByLabel("Họ và tên", { exact: true }).fill(name);
  await add.getByLabel("Email", { exact: true }).fill(email);
  await add.getByRole("combobox", { name: "Vai trò", exact: true }).click();
  await owner.getByRole("option", { name: role, exact: true }).click();
  await add.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(
    owner.getByText(`Đã tạo tài khoản và gửi liên kết tới ${email}`),
  ).toBeVisible();
}

async function setPassword(
  page: Page,
  origin: string,
  token: string,
  password: string,
) {
  await page.goto(`${origin}/set-password#token=${token}`);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Đặt mật khẩu và đăng nhập", exact: true })
    .click();
}

test("an invitation's link opens at the host its recipient belongs at, and nowhere else", async ({
  browser,
  page: owner,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const teacherEmail = `gv.host.${stamp}@example.com`;
  const studentEmail = `hv.host.${stamp}@example.com`;
  const password = `Host-pass-${stamp}`;

  await submitSignIn(owner, STAFF_HOST, ADMIN);
  await expect(owner).toHaveURL(/\/(admin|teacher)$/);
  await addUser(owner, `Giáo viên host ${stamp}`, teacherEmail, "Giáo viên");
  await addUser(owner, `Học viên host ${stamp}`, studentEmail, "Học viên");

  const forTeacher = await setPasswordLink(teacherEmail);
  const forStudent = await setPasswordLink(studentEmail);
  expect(forTeacher.origin).toBe(STAFF_HOST);
  expect(forStudent.origin).toBe(STUDENT_HOST);

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await setPassword(page, STAFF_HOST, forStudent.token, password);
    await expect(page.getByRole("alert")).toContainText(
      "Đây là tài khoản học viên. Hãy đăng nhập tại localhost:4174.",
    );
    expect(await refreshCookies(context)).toEqual([]);

    await setPassword(page, forStudent.origin, forStudent.token, password);
    await expect(page).toHaveURL(`${STUDENT_HOST}/`);
    expect(await refreshCookies(context)).toEqual([STUDENT_COOKIE]);

    const teacher = await context.newPage();
    await setPassword(teacher, forTeacher.origin, forTeacher.token, password);
    await expect(teacher).toHaveURL(`${STAFF_HOST}/teacher`);
    expect(await refreshCookies(context)).toEqual([STAFF_COOKIE, STUDENT_COOKIE]);
  } finally {
    await context.close();
  }
});
