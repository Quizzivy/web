import { expect, test, type Page } from "@playwright/test";
import { API, stubApi } from "./support/api";
import {
  LANDING_CENTRE,
  LANDING_HOST,
  ONE_HOST,
  STAFF_HOST,
  STUDENT_HOST,
} from "./support/hosts";

/**
 * The landing site: a production build of its own (dist-landing), served at
 * its own origin as on its own Pages project. The API is stubbed, so each
 * test is about what the browser does: which requests leave the page, where a
 * link leads, and what a request to the API carries.
 */

const HEADLINE = /Học tiếng Anh trên lớp,\s*làm bài\s*trên Quizzivy/;

/** Collects every request the page makes to an origin that is not its own. */
function elsewhere(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(LANDING_HOST)) urls.push(request.url());
  });
  return urls;
}

// Only a browser on the real build shows that opening the page restores no
// session and reads nothing from the API: the boot that does both is the app's.
test("an anonymous visit to the Landing asks the API for nothing", async ({ page }) => {
  const requests = elsewhere(page);

  await page.goto(`${LANDING_HOST}/`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);
  await page
    .getByRole("heading", { name: "Câu hỏi thường gặp" })
    .scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");

  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});

// A link written by path would be a 404 here: each one into the app has to
// carry the host that serves it, and that host has to serve it.
test("every way into the app leads to a page the other host serves", async ({
  page,
}) => {
  await stubApi(page, {
    "GET /auth/me": { status: 401, body: {} },
    "POST /auth/refresh": { status: 401, body: {} },
    "GET /public/organization": { body: {} },
    "GET /public/status": { body: { maintenance: null, ai: false } },
  });
  await page.goto(`${LANDING_HOST}/`);

  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /Học viên/ })).toHaveAttribute(
    "href",
    `${STUDENT_HOST}/login`,
  );
  await expect(
    menu.getByRole("menuitem", { name: /Giáo viên và quản trị/ }),
  ).toHaveAttribute("href", `${STAFF_HOST}/login`);
  await page.keyboard.press("Escape");

  const footer = page.getByRole("contentinfo");
  const into = await footer
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
  const app = into.filter((href) => !href.startsWith("http://localhost:4176"));
  expect(app).toEqual([
    `${STUDENT_HOST}/login`,
    `${STAFF_HOST}/login`,
    `${STUDENT_HOST}/join`,
    "mailto:hello@quizzivy.com",
  ]);
  for (const href of app.slice(0, 3)) {
    await page.goto(href);
    await expect(
      page.getByRole("heading", { name: "Trang này không tồn tại" }),
      href,
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 }), href).toBeVisible();
  }
});

test("a whole class code opens that class on the student site", async ({ page }) => {
  await stubApi(page, {
    "GET /auth/me": { status: 401, body: {} },
    "POST /auth/refresh": { status: 401, body: {} },
    "GET /public/organization": { body: {} },
    "POST /join/preview": { status: 404, body: { error: { code: "NOT_FOUND" } } },
  });
  await page.goto(`${LANDING_HOST}/`);

  const code = page.getByRole("textbox", { name: "Mã lớp" });
  await code.fill("k7qm2");
  await code.press("Enter");
  await expect(page.getByText("Nhập đủ 8 ký tự.")).toBeVisible();
  await expect(page).toHaveURL(`${LANDING_HOST}/`);

  await code.fill("k7qm2pxa");
  await page.getByRole("button", { name: "Tham gia lớp" }).click();
  await expect(page).toHaveURL(`${STUDENT_HOST}/join/K7QM-2PXA`);
});

// What the request carries is the browser's doing: no cookie and no
// credentials, from the site's own origin, which is what the API allows it.
test("the consultation form is the page's one call, and carries no credentials", async ({
  page,
}) => {
  const calls: {
    key: string;
    origin: string | null;
    cookie: string | null;
    body: unknown;
  }[] = [];
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    calls.push({
      key: `${request.method()} ${new URL(request.url()).pathname}`,
      origin: await request.headerValue("origin"),
      cookie: await request.headerValue("cookie"),
      body: request.postDataJSON(),
    });
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ received: true }),
    });
  });
  await page
    .context()
    .addCookies([{ name: "quizzivy_refresh_student", value: "x", url: `${API}/auth` }]);
  await page.goto(`${LANDING_HOST}/`);

  await page.getByRole("textbox", { name: "Họ và tên" }).fill("Trần Thu Hà");
  await page.getByRole("textbox", { name: "Số điện thoại" }).fill("0903 123 456");
  await page.getByRole("button", { name: "IELTS" }).click();
  await page.getByRole("button", { name: "Gửi yêu cầu tư vấn" }).click();
  await expect(
    page.getByText("Vui lòng đồng ý để chúng tôi liên hệ trước khi gửi."),
  ).toBeVisible();
  expect(calls).toEqual([]);

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Gửi yêu cầu tư vấn" }).click();
  await expect(page.getByText("Cảm ơn, chúng tôi đã nhận")).toBeVisible();
  await expect(
    page.getByText("Tư vấn viên sẽ gọi cho Trần Thu Hà trong vòng 1 ngày làm việc."),
  ).toBeVisible();

  expect(calls).toEqual([
    {
      key: "POST /public/leads",
      origin: LANDING_HOST,
      cookie: null,
      body: {
        fullName: "Trần Thu Hà",
        phone: "0903 123 456",
        interests: ["ielts"],
        courseFor: "self",
        callTime: "any",
        locale: "vi",
        consent: true,
        privacyNoticeVersion: "2026-11",
      },
    },
  ]);
});

test("the form keeps what was typed when there are too many requests", async ({
  page,
}) => {
  await page.route(`${API}/public/leads`, (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: {
        "Retry-After": "540",
        "Access-Control-Expose-Headers": "Retry-After",
      },
      body: JSON.stringify({
        error: { code: "RATE_LIMITED", message: "", requestId: "e2e" },
      }),
    }),
  );
  await page.goto(`${LANDING_HOST}/`);

  await page.getByRole("textbox", { name: "Họ và tên" }).fill("Trần Thu Hà");
  await page.getByRole("textbox", { name: "Số điện thoại" }).fill("0903123456");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Gửi yêu cầu tư vấn" }).click();

  await expect(
    page.getByText("Có quá nhiều yêu cầu từ kết nối này. Hãy thử lại sau 9 phút."),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Họ và tên" })).toHaveValue(
    "Trần Thu Hà",
  );
});

test("the status page asks once when it opens, and again only when told to", async ({
  page,
}) => {
  const asked: (string | null)[] = [];
  await page.route(`${API}/**`, async (route) => {
    asked.push(await route.request().headerValue("cookie"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ maintenance: null, ai: false }),
    });
  });

  await page.goto(`${LANDING_HOST}/`);
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Trạng thái hệ thống" })
    .click();
  await expect(page).toHaveURL(`${LANDING_HOST}/status`);
  await expect(
    page.getByRole("heading", { name: "Mọi thứ đang hoạt động bình thường" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(asked).toEqual([null]);

  await page.getByRole("button", { name: "Kiểm tra lại" }).click();
  await expect(page.getByText(/kiểm tra lúc/)).toBeVisible();
  expect(asked).toEqual([null, null]);

  await page.getByRole("link", { name: "Về trang chủ" }).click();
  await expect(page).toHaveURL(`${LANDING_HOST}/`);
});

test("the notice opens from the footer and from the form's box, and nothing of the app is served here", async ({
  page,
}) => {
  const requests = elsewhere(page);
  await page.goto(`${LANDING_HOST}/`);

  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Quyền riêng tư" })
    .click();
  await expect(page).toHaveURL(`${LANDING_HOST}/privacy`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Thông báo về quyền riêng tư" }),
  ).toBeVisible();
  await expect(
    page.getByText("Phiên bản 2026-11 · có hiệu lực từ 14/11/2026"),
  ).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Hỏi đáp" }).click();
  await expect(page).toHaveURL(`${LANDING_HOST}/#faq`);
  await expect(
    page.getByRole("heading", { name: "Câu hỏi thường gặp" }),
  ).toBeInViewport();

  for (const path of ["/login", "/join", "/teacher", "/admin", "/403"]) {
    await page.goto(`${LANDING_HOST}${path}`);
    await expect(
      page.getByRole("heading", { name: "Trang này không tồn tại" }),
      path,
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Về trang chủ" }).click();
  await expect(page).toHaveURL(`${LANDING_HOST}/`);
  expect(requests).toEqual([]);
});

test("on a phone the menu holds the links, the two sign-ins, the language and the dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`${LANDING_HOST}/`);
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Mở menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByRole("link", { name: /Học viên/ })).toHaveAttribute(
    "href",
    `${STUDENT_HOST}/login`,
  );
  await menu.getByRole("switch", { name: "Giao diện tối" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await menu.getByRole("button", { name: "English" }).click();
  await expect(menu.getByRole("link", { name: "Fair tests" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Learn English in class,\s*take your tests\s*on Quizzivy/,
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

// A static host answers these paths with the site's index.html; only a real
// visit shows that the page then opens there and not the Landing.
test("a direct visit or a reload of the notice and the status page opens that page", async ({
  page,
}) => {
  await page.route(`${API}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ maintenance: null, ai: false }),
    }),
  );
  for (const [path, heading] of [
    ["/privacy", "Thông báo về quyền riêng tư"],
    ["/status", "Mọi thứ đang hoạt động bình thường"],
  ] as const) {
    await page.goto(`${LANDING_HOST}${path}`);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
      path,
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
      path,
    ).toBeVisible();
    await expect(page).toHaveURL(`${LANDING_HOST}${path}`);
  }
});

// A release is checked on each site by its /version.json; the two builds of
// one commit have to say the same version.
test("the landing site says which build it is, as the app does", async ({
  request,
}) => {
  const landing = (await (
    await request.get(`${LANDING_HOST}/version.json`)
  ).json()) as {
    build: string;
    version: string;
  };
  const app = (await (await request.get(`${ONE_HOST}/version.json`)).json()) as {
    build: string;
    version: string;
  };
  expect(landing.version).toBe(app.version);
  expect(landing.build).not.toBe("");
});

// The Pages project also answers on its pages.dev host. What tells a search
// engine which address is the site's is in the files the build writes and in
// the link the page sets once it runs.
test("the pages and the files for search engines name the site's published address", async ({
  page,
  request,
}) => {
  const robots = await (await request.get(`${LANDING_HOST}/robots.txt`)).text();
  expect(robots).toContain("Sitemap: https://quizzivy.com/sitemap.xml");
  const sitemap = await (await request.get(`${LANDING_HOST}/sitemap.xml`)).text();
  expect(sitemap).toContain("<loc>https://quizzivy.com/</loc>");
  expect(sitemap).toContain("<loc>https://quizzivy.com/privacy</loc>");

  const canonical = page.locator('link[rel="canonical"]');
  await page.goto(`${LANDING_HOST}/`);
  await expect(canonical).toHaveAttribute("href", "https://quizzivy.com/");
  await page.goto(`${LANDING_HOST}/privacy`);
  await expect(canonical).toHaveAttribute("href", "https://quizzivy.com/privacy");
  await page.goto(`${LANDING_HOST}/khong-co`);
  await expect(
    page.getByRole("heading", { name: "Trang này không tồn tại" }),
  ).toBeVisible();
  await expect(canonical).toHaveCount(0);
});

// The name reaches the site two ways, the page's tags at build time and its
// lines in the browser: only the built site shows both print the build's own.
test("the site names the centre by the build's name, in its tags and in both languages", async ({
  page,
}) => {
  await page.goto(`${LANDING_HOST}/`);
  for (const tag of ['meta[name="description"]', 'meta[property="og:description"]']) {
    await expect(page.locator(tag)).toHaveAttribute(
      "content",
      new RegExp(`^Quizzivy là hệ thống kiểm tra trực tuyến của ${LANDING_CENTRE}\\. `),
    );
  }
  const footer = page.getByRole("contentinfo");
  const otherCentre = async () =>
    /\bCent(?:re|er)\b/.test(
      (await page.locator("body").innerText()).split(LANDING_CENTRE).join(""),
    );
  await expect(
    page.getByText(`trực tuyến của ${LANDING_CENTRE}. Học viên`),
  ).toBeVisible();
  await expect(page.getByText(`Khoá học tại ${LANDING_CENTRE}`)).toBeVisible();
  await expect(page.getByText(`đồng ý để ${LANDING_CENTRE} dùng`)).toBeVisible();
  await expect(footer).toContainText(`trực tuyến của ${LANDING_CENTRE}.`);
  expect(await otherCentre()).toBe(false);

  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByText(`testing system of ${LANDING_CENTRE}. Students`),
  ).toBeVisible();
  await expect(page.getByText(`Courses at ${LANDING_CENTRE}`)).toBeVisible();
  await expect(footer).toContainText(`testing system of ${LANDING_CENTRE}.`);
  expect(await otherCentre()).toBe(false);
});
