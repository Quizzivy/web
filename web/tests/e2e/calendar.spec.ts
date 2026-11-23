import { expect, test, type Page, type Request } from "@playwright/test";
import type { components } from "@/lib/api/schema";
import { adminUser, sessionAs, stubApi } from "./support/api";
import { dashboard23Summary } from "../support/dashboard23";
import { assertContractRequest, contractJson } from "../support/contractResponse";
import {
  DECK_ASSIGNMENTS,
  DECK_CLASSES,
  deckClass,
  deckSession,
  deckWeek,
} from "../support/calendar";

/**
 * The teacher's Calendar (T-R8.10, T-R8.16) in the built app: the week as a
 * grid from 768px, the agenda on a phone, and New session. Every answer is the
 * contract's, checked before it is sent, and so is every body the page posts.
 * The clock stands where the deck's does: Wednesday 24 September 2025, 20:15
 * in Ho Chi Minh City.
 */

type Calendar = components["schemas"]["Calendar"];
type SessionCreate = components["schemas"]["SessionCreate"];

const NOW = new Date("2025-09-24T13:15:00Z");
const MONDAY = "2025-09-22";

async function contract(path: string, method: string, status: number, body: unknown) {
  return JSON.stringify(await contractJson(path, method, status, body).json());
}

interface Served {
  /** The `from` of every calendar read, in order. */
  reads: string[];
  /** The class and body of every New session post. */
  posted: { classId: string; body: SessionCreate }[];
}

async function prepare(page: Page, answer: (from: string) => Calendar = deckWeek) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => localStorage.setItem("quizzivy.theme", "light"));
  const served: Served = { reads: [], posted: [] };
  await stubApi(page, {
    ...sessionAs(adminUser),
    "GET /teacher/summary": { body: dashboard23Summary() },
    "GET /me/summary": { body: { unreadNotifications: 0, unreadMessages: 0 } },
    "GET /teacher/calendar": async (route) => {
      const query = new URL(route.request().url()).searchParams;
      const from = query.get("from") ?? "";
      served.reads.push(from);
      await route.fulfill({
        contentType: "application/json",
        body: await contract("/teacher/calendar", "get", 200, answer(from)),
      });
    },
    "GET /teacher/classes": async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: await contract("/teacher/classes", "get", 200, {
          items: [deckClass("evening"), deckClass("foundation")],
          page: 1,
          pageSize: 100,
          total: 2,
          facets: { all: 2, joinable: 2, archived: 0, students: 36 },
        }),
      });
    },
  });
  await page.route(
    "http://localhost:8080/teacher/classes/*/sessions",
    async (route) => {
      const request: Request = route.request();
      const body = request.postDataJSON() as SessionCreate;
      assertContractRequest("/teacher/classes/{id}/sessions", "post", body);
      const classId = new URL(request.url()).pathname.split("/")[3] ?? "";
      served.posted.push({ classId, body });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: await contract(
          "/teacher/classes/{id}/sessions",
          "post",
          201,
          deckSession("2025-10-06", 1, 17.5, 2, "foundation"),
        ),
      });
    },
  );
  return served;
}

/** noSideScroll is true while neither the page nor the main column scrolls sideways. */
async function noSideScroll(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    return (
      document.documentElement.scrollWidth <= innerWidth &&
      (main === null || main.scrollWidth <= main.clientWidth)
    );
  });
}

test("the week grid: seven days from Monday, the deck's sessions in their hours, today with the now-line", async ({
  page,
}) => {
  const served = await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/teacher/calendar");

  await expect(
    page.getByRole("heading", { level: 1, name: "22 – 28 tháng 9" }),
  ).toBeVisible();
  const week = page.getByRole("region", { name: "22 – 28 tháng 9" });
  await expect(week).not.toHaveAttribute("aria-busy", "true");
  const days = week.getByRole("group");
  await expect(days).toHaveCount(7);
  const wednesday = week.getByRole("group", { name: "Th 4, 24 thg 9" });
  await expect(wednesday).toHaveAttribute("aria-current", "date");
  await expect(wednesday.locator("[data-slot='now-line']")).toBeVisible();

  // The seven columns share the card's width, and each block stays inside its day.
  const widths = await days.evaluateAll((columns) =>
    columns.map((column) => Math.round(column.getBoundingClientRect().width)),
  );
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  const evening = wednesday.getByRole("button", {
    name: "IELTS 6.5 Evening 18:00 – 19:30",
  });
  const column = (await wednesday.boundingBox())!;
  const block = (await evening.boundingBox())!;
  expect(block.x).toBeGreaterThanOrEqual(column.x);
  expect(block.x + block.width).toBeLessThanOrEqual(column.x + column.width);
  // Ten 44px hours below 08:00 and a pixel; 90 minutes less the 3px gap.
  expect(Math.round(block.y - column.y)).toBe(10 * 44 + 1);
  expect(Math.round(block.height)).toBe(1.5 * 44 - 3);

  await expect(
    week
      .getByRole("group", { name: "Th 7, 27 thg 9" })
      .getByRole("button", { name: /^TOEIC 600 Weekend 09:00/ }),
  ).toBeVisible();
  await expect(
    wednesday.getByRole("link", { name: /^Reading Mock mở/ }),
  ).toHaveAttribute("href", `/teacher/assignments/${DECK_ASSIGNMENTS.reading}`);
  expect(await noSideScroll(page)).toBe(true);

  // A session opens its popover; the next week is its own address and read.
  await evening.click();
  const popover = page.getByRole("dialog", { name: "IELTS 6.5 Evening" });
  await expect(popover).toContainText("18:00 – 19:30");
  await expect(popover).toContainText(DECK_CLASSES.evening.room);
  await expect(evening).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();

  await page.getByRole("button", { name: "Tuần sau" }).click();
  await expect(page).toHaveURL(/\/teacher\/calendar\?week=2025-W40$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "29 tháng 9 – 5 tháng 10",
  );
  await page.getByRole("button", { name: "Hôm nay", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher\/calendar$/);
  expect(served.reads).toEqual([MONDAY, "2025-09-29"]);
});

test("the agenda at 360: the days from today, each row a session or a test, a session's sheet", async ({
  page,
}) => {
  await prepare(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/teacher/calendar");

  const today = page.getByRole("heading", {
    level: 2,
    name: "Hôm nay · Th 4, 24 thg 9",
  });
  await expect(today).toBeVisible();
  await expect(page.getByRole("group", { name: /thg 9/ })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText([
    "Hôm nay · Th 4, 24 thg 9",
    "Th 5, 25 thg 9",
    "Th 6, 26 thg 9",
    "Th 7, 27 thg 9",
    "CN, 28 thg 9",
  ]);
  const rows = page.locator("section", { has: today }).getByRole("listitem");
  await expect(rows).toHaveText([
    /^08:00\s*Reading Mock mở\s*Khung làm bài$/,
    /^18:00\s*IELTS 6\.5 Evening\s*18:00 – 19:30$/,
    /^21:00\s*Reading Mock đóng\s*Khung làm bài$/,
  ]);
  expect(await noSideScroll(page)).toBe(true);

  // A row is a 44px target at least, and the session's sheet spans the phone.
  const session = rows.nth(1).getByRole("button");
  expect((await session.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await session.click();
  const sheet = page.getByRole("dialog", { name: "IELTS 6.5 Evening" });
  await expect(sheet).toContainText("18:00 – 19:30");
  // Measured once its opening zoom has run.
  await expect
    .poll(async () => {
      const box = (await sheet.boundingBox())!;
      return [Math.round(box.x), Math.round(box.width)];
    })
    .toEqual([0, 360]);
});

test("New session: the deck's form, the room following the class, and the post the contract takes", async ({
  page,
}) => {
  const served = await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/teacher/calendar");
  await expect(
    page.getByRole("region", { name: "22 – 28 tháng 9" }),
  ).not.toHaveAttribute("aria-busy", "true");

  await page.getByRole("button", { name: "Buổi học", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Buổi học mới" });
  await expect(dialog).toBeVisible();
  // As it opens: the first class with its room, today, 18:00, 90 minutes, every week.
  await expect(dialog.getByRole("combobox", { name: "Lớp" })).toHaveText(
    DECK_CLASSES.evening.name,
  );
  await expect(dialog.getByRole("button", { name: /^Ngày / })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Bắt đầu 18:00" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "90 phút" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const room = dialog.getByRole("textbox", { name: "Phòng" });
  await expect(room).toHaveValue(DECK_CLASSES.evening.room);
  await expect(dialog.getByRole("switch", { name: "Lặp lại mỗi tuần" })).toBeChecked();
  await expect(dialog).toContainText("Đến hết 19 thg 12");

  await dialog.getByRole("combobox", { name: "Lớp" }).click();
  await page.getByRole("option", { name: DECK_CLASSES.foundation.name }).click();
  await expect(room).toHaveValue(DECK_CLASSES.foundation.room);

  await dialog.getByRole("button", { name: "Bắt đầu 18:00" }).click();
  const clock = page.getByRole("dialog", { name: "Chọn giờ" });
  await clock.getByRole("button", { name: "Giảm giờ" }).click();
  for (let step = 0; step < 6; step++)
    await clock.getByRole("button", { name: "Tăng phút" }).click();
  await clock.getByRole("button", { name: "Xong" }).click();
  await expect(dialog.getByRole("button", { name: "Bắt đầu 17:30" })).toBeVisible();
  await dialog.getByRole("button", { name: "120 phút" }).click();

  await dialog.getByRole("button", { name: "Thêm buổi học" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Đã thêm buổi học · IELTS Foundation A, 17:30"),
  ).toBeVisible();
  expect(served.posted).toEqual([
    {
      classId: DECK_CLASSES.foundation.id,
      body: {
        date: "2025-09-24",
        startTime: "17:30",
        durationMinutes: 120,
        room: DECK_CLASSES.foundation.room,
        repeatWeekly: true,
      },
    },
  ]);
  // The answer's first occurrence is two weeks on, so the page goes to its week.
  await expect(page).toHaveURL(/\/teacher\/calendar\?week=2025-W41$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("6 – 12 tháng 10");
  await expect.poll(() => served.reads.includes("2025-10-06")).toBe(true);
});
