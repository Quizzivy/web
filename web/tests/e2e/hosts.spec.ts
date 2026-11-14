import { expect, test, type Page } from "@playwright/test";
import { adminUser, anonymous, sessionAs, studentUser, stubApi } from "./support/api";
import { ONE_HOST, STAFF_HOST, STUDENT_HOST } from "./support/hosts";
import { student } from "./support/student";

/**
 * The two web hosts (§5.8), from one production build served on three origins.
 * The API is stubbed, so each test is about what the browser does with the
 * build at an origin: which pages it serves, where it sends a visitor, and the
 * Origin its calls carry, which is what the API tells the hosts apart by.
 */

const NOT_FOUND = "Trang này không tồn tại";

async function staff(page: Page) {
  await stubApi(page, {
    ...sessionAs(adminUser),
    "GET /public/status": { body: { maintenance: null, ai: true } },
    "PATCH /me/preferences": { body: {} },
  });
}

const wrongHost = (message: string) => ({
  ...anonymous,
  "POST /auth/login": {
    status: 403,
    body: { error: { code: "FORBIDDEN", message, requestId: "e2e" } },
  },
});

async function signIn(page: Page, host: string) {
  await page.goto(`${host}/login`);
  await page.getByLabel("Email").fill("ai-do@example.com");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("quizzivy-dev");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test("the student host serves the student's pages at its root and none of the staff's", async ({
  page,
}) => {
  await student(page);

  await page.goto(`${STUDENT_HOST}/`);
  await expect(page).toHaveURL(`${STUDENT_HOST}/`);
  const classes = page.getByRole("link", { name: "Lớp", exact: true });
  await expect(classes).toBeVisible();

  await classes.click();
  await expect(page).toHaveURL(`${STUDENT_HOST}/classes`);
  await expect(page.getByText("Lớp luyện tập buổi tối").first()).toBeVisible();

  for (const path of [
    "/teacher",
    "/teacher/tests",
    "/admin/users",
    "/app",
    "/app/classes",
  ]) {
    await page.goto(`${STUDENT_HOST}${path}`);
    await expect(page.getByRole("heading", { name: NOT_FOUND }), path).toBeVisible();
  }
});

test("the staff host sends its root to the console and serves none of the student's pages", async ({
  page,
}) => {
  await staff(page);

  await page.goto(`${STAFF_HOST}/`);
  await expect(page).toHaveURL(`${STAFF_HOST}/admin`);

  await page.goto(`${STAFF_HOST}/teacher`);
  await expect(page).toHaveURL(`${STAFF_HOST}/teacher`);
  await expect(
    page.getByRole("navigation", { name: "Điều hướng chính" }),
  ).toBeVisible();

  for (const path of ["/classes", "/settings", "/join", "/join/K7M3-P9QR", "/app"]) {
    await page.goto(`${STAFF_HOST}${path}`);
    await expect(page.getByRole("heading", { name: NOT_FOUND }), path).toBeVisible();
  }
});

test("a student signed in at the staff host gets the 403 page at its root, not a console", async ({
  page,
}) => {
  await stubApi(page, sessionAs(studentUser));

  await page.goto(`${STAFF_HOST}/`);
  await expect(page).toHaveURL(`${STAFF_HOST}/403`);
  await expect(
    page.getByRole("heading", { name: "Bạn không có quyền mở trang này" }),
  ).toBeVisible();
});

test("staff signed in at the student host get the 403 page at its root", async ({
  page,
}) => {
  await staff(page);

  await page.goto(`${STUDENT_HOST}/`);
  await expect(page).toHaveURL(`${STUDENT_HOST}/`);
  await expect(
    page.getByRole("heading", { name: "Bạn không có quyền mở trang này" }),
  ).toBeVisible();
});

test("a signed-out visitor at either host's root is sent to its own sign-in page", async ({
  page,
}) => {
  await stubApi(page, anonymous);
  for (const host of [STUDENT_HOST, STAFF_HOST, ONE_HOST]) {
    await page.goto(`${host}/`);
    await expect(page).toHaveURL(`${host}/login`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập");
  }
});

test("every call to the API carries the origin of the host it came from", async ({
  page,
}) => {
  const origins: string[] = [];
  await stubApi(page, {
    "GET /auth/me": async (route) => {
      origins.push((await route.request().headerValue("origin")) ?? "");
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
    },
    "POST /auth/refresh": async (route) => {
      origins.push((await route.request().headerValue("origin")) ?? "");
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
    },
  });

  for (const host of [STUDENT_HOST, STAFF_HOST]) {
    origins.length = 0;
    await page.goto(`${host}/login`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập");
    expect(origins.length, host).toBeGreaterThanOrEqual(2);
    expect(new Set(origins), host).toEqual(new Set([host]));
  }
});

test("an account refused at the student host is shown the way to the staff host", async ({
  page,
}) => {
  const message =
    "Tài khoản này dành cho giáo viên và quản trị viên. Hãy đăng nhập tại localhost:4175.";
  await stubApi(page, wrongHost(message));
  await signIn(page, STUDENT_HOST);

  await expect(page.getByRole("alert")).toContainText(message);
  const link = page.getByRole("link", {
    name: "Mở trang đăng nhập của localhost:4175",
  });
  await expect(link).toHaveAttribute("href", `${STAFF_HOST}/login`);
  await link.click();
  await expect(page).toHaveURL(`${STAFF_HOST}/login`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập");
});

test("an account refused at the staff host is shown the way to the student host", async ({
  page,
}) => {
  const message = "Đây là tài khoản học viên. Hãy đăng nhập tại localhost:4174.";
  await stubApi(page, wrongHost(message));
  await signIn(page, STAFF_HOST);

  await expect(page.getByRole("alert")).toContainText(message);
  await expect(
    page.getByRole("link", { name: "Mở trang đăng nhập của localhost:4174" }),
  ).toHaveAttribute("href", `${STUDENT_HOST}/login`);
});

test("one host for every page serves both sides and offers no other host", async ({
  page,
}) => {
  await stubApi(page, wrongHost("Bạn không có quyền truy cập chức năng này."));
  await signIn(page, ONE_HOST);
  await expect(page.getByRole("alert")).toContainText(
    "Bạn không có quyền truy cập chức năng này.",
  );
  await expect(page.getByRole("link", { name: /Mở trang đăng nhập của/ })).toHaveCount(
    0,
  );

  await page.unrouteAll({ behavior: "wait" });
  await student(page);
  await page.goto(`${ONE_HOST}/classes`);
  await expect(page.getByText("Lớp luyện tập buổi tối").first()).toBeVisible();
  await page.goto(`${ONE_HOST}/join`);
  await expect(page.getByRole("heading", { name: NOT_FOUND })).toHaveCount(0);
});

test("a visitor with a class code at the staff host's sign-in page reaches the join page", async ({
  page,
}) => {
  await stubApi(page, anonymous);
  await page.goto(`${STAFF_HOST}/login`);

  const join = page.getByRole("link", { name: "Tham gia lớp", exact: true });
  await expect(join).toHaveAttribute("href", `${STUDENT_HOST}/join`);
  await join.click();
  await expect(page).toHaveURL(`${STUDENT_HOST}/join`);
  await expect(page.getByRole("heading", { name: "Tham gia lớp học" })).toBeVisible();
});

const SIGNED_OUT = [
  "/login",
  "/forgot-password",
  "/set-password",
  "/auth/google/callback",
  "/403",
  "/duong-dan-khong-ton-tai",
];

/**
 * Every link a signed-out visitor can follow, on every page a host shows them,
 * followed in the browser. It fails when a page of one host links to a path
 * only the other host serves, as the staff host's sign-in page did with
 * `/join` in v0.13.5: nothing below the built router knows which host a path
 * belongs to.
 */
for (const [name, host] of [
  ["student", STUDENT_HOST],
  ["staff", STAFF_HOST],
  ["one", ONE_HOST],
] as const) {
  test(`every link on the ${name} host's signed-out pages leads to a page that exists`, async ({
    page,
  }) => {
    await stubApi(page, anonymous);
    const ours = new Set([STUDENT_HOST, STAFF_HOST, ONE_HOST]);
    const targets = new Map<string, string>();
    for (const path of SIGNED_OUT) {
      await page.goto(`${host}${path}`);
      await expect(page.getByRole("heading").first()).toBeVisible();
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
      for (const href of hrefs) {
        const url = new URL(href);
        if (ours.has(url.origin)) targets.set(url.origin + url.pathname, path);
      }
    }

    expect([...targets.keys()]).toContain(`${host}/login`);
    for (const [target, from] of targets) {
      await page.goto(target);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(
        page.getByRole("heading", { name: NOT_FOUND }),
        `${target}, linked from ${host}${from}`,
      ).toHaveCount(0);
    }
  });
}
