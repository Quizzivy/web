import { expect, test, type Page, type Route } from "@playwright/test";
import type { components } from "@/lib/api/schema";
import { adminUser, sessionAs, stubApi } from "./support/api";
import { assertContractRequest, contractJson } from "../support/contractResponse";

/**
 * F2's staff Messages in the built app (T-F2.9, DG-233): New message's
 * students (the filter, a search, a row with a thread and one without) and
 * its colleagues, and the Colleagues tab with a thread, a disabled account and
 * an empty thread. The stubs answer as the server would, every answer checked
 * against the contract before it is sent and every post's body before it is
 * taken. The clock is fixed: Tuesday 24 November 2026, 20:30 in Ho Chi Minh
 * City.
 */

type Schemas = components["schemas"];
type Thread = Schemas["StaffThread"];
type Message = Schemas["StaffMessage"];
type Recipient = Schemas["MessageRecipient"];
type Colleague = Schemas["ColleagueThread"];
type Post = Schemas["StaffMessagePost"];

const NOW = new Date("2026-11-24T13:30:00Z");
const API = "http://localhost:8080";

const uid = (n: number, head = "0193") =>
  `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

/** `hh:mm` in Ho Chi Minh City `days` days before NOW. */
function at(days: number, time: string): string {
  const day = new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return new Date(`${day}T${time}:00+07:00`).toISOString();
}

const ME = { id: uid(1, "0195"), name: "Giàu Bùi" };
const teacher = {
  ...adminUser,
  id: ME.id,
  email: "giau@example.com",
  fullName: ME.name,
  permissions: [
    "content.tests.write",
    "content.tests.publish",
    "content.share",
    "teaching.classes.write",
    "teaching.assignments.write",
    "teaching.grading",
    "people.students.read",
  ],
  workspaces: ["teacher"],
};

const EVENING = { id: uid(11, "0191"), name: "IELTS 6.5 Evening" };
const FOUNDATION = { id: uid(12, "0191"), name: "IELTS Foundation A" };

/** The proposal's students: Nam has a thread with the caller, Châu is in no class, Minh in another teacher's. */
const NAM = { id: uid(101, "0192"), name: "Lê Hoàng Nam" };
const MINH = { id: uid(102, "0192"), name: "Hoàng Đức Minh" };
const CHAU = { id: uid(103, "0192"), name: "Lâm Minh Châu" };
const ANH = { id: uid(104, "0192"), name: "Trần Minh Anh" };

const STUDENTS: readonly Recipient[] = [
  recipient(CHAU, { classNames: [], otherClassNames: [] }),
  recipient(MINH, { otherClassNames: ["Kids Starters B"] }),
  recipient(NAM, {
    classNames: [EVENING.name],
    otherClassNames: ["Speaking Club Saturday"],
    threadExists: true,
  }),
  recipient(ANH, { classNames: [FOUNDATION.name] }),
];

/** The proposal's colleagues: Đức and Trang teach, Vân's account is disabled. */
const DUC = { id: uid(41, "0194"), name: "Phan Minh Đức" };
const TRANG = { id: uid(42, "0194"), name: "Nguyễn Thu Trang" };
const VAN = { id: uid(44, "0194"), name: "Lý Thanh Vân" };

function recipient(
  who: { id: string; name: string },
  extra: Partial<Recipient> = {},
): Recipient {
  return {
    id: who.id,
    name: who.name,
    avatarUrl: null,
    classNames: [],
    otherClassNames: [],
    roleName: null,
    roleBuiltinKey: null,
    threadExists: false,
    canPost: true,
    ...extra,
  };
}

const COLLEAGUE_RECIPIENTS: readonly Recipient[] = [
  recipient(DUC, {
    roleName: "Giáo viên",
    roleBuiltinKey: "teacher",
    threadExists: true,
  }),
  recipient(TRANG, { roleName: "Giáo viên", roleBuiltinKey: "teacher" }),
];

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function colleagueRow(
  who: { id: string; name: string },
  when: string,
  text: string,
  extra: Partial<Colleague> = {},
): Colleague {
  return {
    colleagueId: who.id,
    title: who.name,
    avatarUrl: null,
    roleName: "Giáo viên",
    roleBuiltinKey: "teacher",
    candidate: false,
    disabled: false,
    lastMessageAt: when,
    preview: { text, attachmentName: null, mine: false },
    unread: 0,
    ...extra,
  };
}

const NAM_ROW: Thread = {
  thread: { kind: "direct", classId: null, studentId: NAM.id },
  title: NAM.name,
  avatarUrl: null,
  classNames: [EVENING.name],
  otherClassNames: ["Speaking Club Saturday"],
  studentCount: null,
  former: false,
  candidate: false,
  disabled: false,
  lastMessageAt: at(0, "20:32"),
  preview: { text: "Dạ em cảm ơn ạ.", attachmentName: null, mine: false },
  unread: 0,
};

const CHANNEL_ROW: Thread = {
  thread: { kind: "class", classId: EVENING.id, studentId: null },
  title: EVENING.name,
  avatarUrl: null,
  classNames: [],
  otherClassNames: [],
  studentCount: 24,
  former: false,
  candidate: false,
  disabled: false,
  lastMessageAt: at(1, "17:42"),
  preview: {
    text: "Đáp án Unit 4, các em xem trước buổi thứ Năm.",
    attachmentName: null,
    mine: true,
  },
  unread: 0,
};

const CUE: Schemas["MessageAttachment"] = {
  id: uid(951),
  filename: "Thẻ gợi ý Speaking Part 2.pdf",
  bytes: 880_640,
  mimeType: "application/pdf",
};

let seq = 300;
function said(
  from: { id: string; name: string },
  side: "staff" | "student",
  mine: boolean,
  body: string | null,
  createdAt: string,
  attachment: Schemas["MessageAttachment"] | null = null,
): Message {
  seq += 1;
  return {
    id: uid(seq),
    sender: mine
      ? { id: ME.id, name: ME.name, avatarUrl: null, side: "staff" }
      : { id: from.id, name: from.name, avatarUrl: null, side },
    body,
    attachment,
    createdAt,
    mine,
  };
}

async function contract(
  route: Route,
  path: string,
  method: string,
  status: number,
  body: unknown,
) {
  if (status === 204) {
    await route.fulfill({ status });
    return;
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(await contractJson(path, method, status, body).json()),
  });
}

/** World is what the stubs hold, so a post shows on the next read as the server's would. */
type World = {
  recipients: URL[];
  posts: { path: string; body: Post }[];
  reads: string[];
  students: Map<string, Message[]>;
  colleagues: Map<string, Message[]>;
  colleagueRows: Colleague[];
};

/**
 * prepare serves the caller's two classes, the list (Nam's thread and the
 * Evening channel), the colleague threads (Đức with one unread and a PDF,
 * Vân disabled), New message's two audiences, and every thread they open.
 */
async function prepare(page: Page): Promise<World> {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    localStorage.setItem("quizzivy.theme", "light");
    localStorage.setItem("quizzivy.locale", "vi");
  });
  const world: World = {
    recipients: [],
    posts: [],
    reads: [],
    students: new Map([
      [
        NAM.id,
        [
          said(NAM, "student", false, "Cô ơi em nộp bài nghe rồi ạ.", at(0, "20:20")),
          said(NAM, "student", true, "Cô thấy rồi, em làm tốt lắm.", at(0, "20:28")),
          said(NAM, "student", false, "Dạ em cảm ơn ạ.", at(0, "20:32")),
        ],
      ],
    ]),
    colleagues: new Map([
      [
        DUC.id,
        [
          said(
            DUC,
            "staff",
            false,
            "Chị Giàu ơi, em gửi chị bộ thẻ gợi ý em dùng cho lớp tối thứ Bảy.",
            at(1, "21:05"),
            CUE,
          ),
          said(
            DUC,
            "staff",
            false,
            "Cảm ơn chị, tuần sau em thử với lớp Kids Starters B.",
            at(0, "20:10"),
          ),
        ],
      ],
      [
        VAN.id,
        [
          said(
            VAN,
            "staff",
            false,
            "Chị gửi lại em bộ đề Reading cũ nhé.",
            at(12, "09:40"),
          ),
        ],
      ],
    ]),
    colleagueRows: [
      colleagueRow(
        DUC,
        at(0, "20:10"),
        "Cảm ơn chị, tuần sau em thử với lớp Kids Starters B.",
        {
          unread: 1,
        },
      ),
      colleagueRow(VAN, at(12, "09:40"), "Chị gửi lại em bộ đề Reading cũ nhé.", {
        disabled: true,
      }),
    ],
  };

  await stubApi(page, {
    ...sessionAs(teacher),
    "GET /teacher/summary": (route) =>
      contract(route, "/teacher/summary", "get", 200, {
        liveAssignments: 1,
        answersToGrade: 0,
        unreadNotifications: 0,
        sharedWithMe: 0,
        unreadMessages: world.colleagueRows.reduce((sum, row) => sum + row.unread, 0),
      }),
    "GET /teacher/classes": (route) =>
      contract(route, "/teacher/classes", "get", 200, {
        items: [EVENING, FOUNDATION].map((klass) => ({
          id: klass.id,
          name: klass.name,
          description: null,
          scheduleLabel: null,
          room: null,
          ownRoom: null,
          schedule: { slots: [], label: null },
          averageScore: null,
          studentCount: 12,
          openAssignmentCount: 0,
          archivedAt: null,
          selfJoinEnabled: false,
          createdAt: "2026-06-01T00:00:00Z",
        })),
        page: 1,
        pageSize: 100,
        total: 2,
        facets: { all: 2, joinable: 0, archived: 0, students: 24 },
      }),
    "GET /teacher/messages/threads": (route) =>
      contract(route, "/teacher/messages/threads", "get", 200, {
        threads: [NAM_ROW, CHANNEL_ROW],
      }),
    "GET /teacher/messages/colleagues": (route) => {
      const q = fold(new URL(route.request().url()).searchParams.get("q") ?? "");
      const found = world.colleagueRows.filter(
        (row) => q === "" || fold(row.title).includes(q),
      );
      const more =
        q === ""
          ? []
          : COLLEAGUE_RECIPIENTS.filter((who) => fold(who.name).includes(q))
              .filter((who) => !found.some((row) => row.colleagueId === who.id))
              .map((who) => ({
                ...colleagueRow(who, at(0, "00:00"), ""),
                candidate: true,
                lastMessageAt: null,
                preview: null,
              }));
      return contract(route, "/teacher/messages/colleagues", "get", 200, {
        threads: [...found, ...more],
      });
    },
    "GET /teacher/messages/recipients": (route) => {
      const url = new URL(route.request().url());
      world.recipients.push(url);
      const query = url.searchParams;
      const q = fold(query.get("q") ?? "");
      const pool =
        query.get("audience") === "colleagues" ? COLLEAGUE_RECIPIENTS : STUDENTS;
      const rows = pool.filter((row) => {
        if (q !== "" && !fold(row.name).includes(q)) return false;
        if (query.get("mine") === "true") return row.classNames.length > 0;
        if (query.get("inNoClass") === "true")
          return row.classNames.length + row.otherClassNames.length === 0;
        if (query.has("classId"))
          return row.classNames.includes(
            query.get("classId") === EVENING.id ? EVENING.name : FOUNDATION.name,
          );
        return true;
      });
      return contract(route, "/teacher/messages/recipients", "get", 200, {
        recipients: rows,
        nextCursor: null,
      });
    },
  });

  await page.route(`${API}/teacher/messages/students/*`, async (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/").at(-1)!;
    const student = STUDENTS.find((row) => row.id === id);
    if (student === undefined) {
      await route.fulfill({ status: 404 });
      return;
    }
    const path = "/teacher/messages/students/{studentId}";
    const messages = world.students.get(id) ?? [];
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Post;
      assertContractRequest(path, "post", body);
      world.posts.push({ path: `/teacher/messages/students/${id}`, body });
      const posted = said(
        student,
        "student",
        true,
        body.body ?? null,
        NOW.toISOString(),
      );
      world.students.set(id, [...messages, posted]);
      await contract(route, path, "post", 201, posted);
      return;
    }
    await contract(route, path, "get", 200, {
      student: {
        id,
        name: student.name,
        avatarUrl: null,
        classes: id === NAM.id ? [{ id: EVENING.id, name: EVENING.name }] : [],
        otherClassNames: student.otherClassNames,
        former: false,
        disabled: false,
        canPost: true,
      },
      messages,
      contextEvents: [],
      nextBefore: null,
      latestId: messages.at(-1)?.id ?? null,
    });
  });
  await page.route(`${API}/teacher/messages/students/*/read`, async (route) => {
    world.reads.push(new URL(route.request().url()).pathname);
    await contract(
      route,
      "/teacher/messages/students/{studentId}/read",
      "post",
      204,
      null,
    );
  });

  await page.route(`${API}/teacher/messages/colleagues/*`, async (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/").at(-1)!;
    const who = [DUC, TRANG, VAN].find((row) => row.id === id);
    if (who === undefined) {
      await route.fulfill({ status: 404 });
      return;
    }
    const path = "/teacher/messages/colleagues/{colleagueId}";
    const messages = world.colleagues.get(id) ?? [];
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Post;
      assertContractRequest(path, "post", body);
      world.posts.push({ path: `/teacher/messages/colleagues/${id}`, body });
      const posted = said(who, "staff", true, body.body ?? null, NOW.toISOString());
      world.colleagues.set(id, [...messages, posted]);
      await contract(route, path, "post", 201, posted);
      return;
    }
    await contract(route, path, "get", 200, {
      colleague: {
        id,
        name: who.name,
        avatarUrl: null,
        roleName: "Giáo viên",
        roleBuiltinKey: "teacher",
        disabled: who === VAN,
        canPost: who !== VAN,
      },
      messages,
      nextBefore: null,
      latestId: messages.at(-1)?.id ?? null,
    });
  });
  await page.route(`${API}/teacher/messages/colleagues/*/read`, async (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/").at(-2)!;
    const body = request.postDataJSON() as { lastReadMessageId: string };
    assertContractRequest(
      "/teacher/messages/colleagues/{colleagueId}/read",
      "post",
      body,
    );
    world.reads.push(new URL(request.url()).pathname);
    world.colleagueRows = world.colleagueRows.map((row) =>
      row.colleagueId === id ? { ...row, unread: 0 } : row,
    );
    await contract(
      route,
      "/teacher/messages/colleagues/{colleagueId}/read",
      "post",
      204,
      null,
    );
  });
  return world;
}

/** The composer is named after the person's given name, the last word of a Vietnamese name. */
const composerName = (who: { name: string }) =>
  `Nhắn cho ${who.name.split(" ").at(-1)}…`;

const picker = (page: Page) => page.getByRole("dialog", { name: "Tin nhắn mới" });
const options = (page: Page) => picker(page).getByRole("option");
const option = (page: Page, name: string) => options(page).filter({ hasText: name });

async function openPicker(page: Page) {
  await page
    .getByRole("main")
    .getByRole("button", { name: "Tin nhắn mới", exact: true })
    .click();
  await expect(picker(page)).toBeVisible();
  await expect(
    picker(page).getByRole("combobox", { name: /Tìm theo tên/ }),
  ).toBeFocused();
}

async function chooseFilter(page: Page, name: string) {
  await picker(page).getByRole("combobox", { name: "Lọc học viên" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

const lastAsked = (world: World) => world.recipients.at(-1)!.searchParams;

test("New message: the students' filter and search, an existing thread, and a new one", async ({
  page,
}) => {
  const world = await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/teacher/messages");
  await expect(page.getByRole("heading", { level: 1, name: "Tin nhắn" })).toBeVisible();

  await openPicker(page);
  // Every student, by name as the server orders them, each with a sub-line.
  await expect(options(page)).toHaveCount(4);
  await expect(option(page, CHAU.name)).toContainText("Chưa vào lớp nào");
  await expect(option(page, MINH.name)).toContainText("Kids Starters B");
  await expect(option(page, NAM.name)).toContainText(EVENING.name);
  await expect(option(page, NAM.name)).toContainText("Đã có cuộc trò chuyện");
  await expect(option(page, ANH.name)).not.toContainText("Đã có cuộc trò chuyện");
  expect(lastAsked(world).get("audience")).toBe("students");

  // The filter: one of at most mine, classId and inNoClass at a time.
  await chooseFilter(page, "Chưa vào lớp nào");
  await expect(options(page)).toHaveCount(1);
  await expect(options(page)).toContainText(CHAU.name);
  expect(lastAsked(world).get("inNoClass")).toBe("true");
  expect(lastAsked(world).has("mine")).toBe(false);

  await chooseFilter(page, EVENING.name);
  await expect(options(page)).toHaveCount(1);
  await expect(options(page)).toContainText(NAM.name);
  expect(lastAsked(world).get("classId")).toBe(EVENING.id);
  expect(lastAsked(world).has("inNoClass")).toBe(false);

  await chooseFilter(page, "Học viên lớp của tôi");
  await expect(options(page)).toHaveCount(2);
  expect(lastAsked(world).get("mine")).toBe("true");
  expect(lastAsked(world).has("classId")).toBe(false);

  await chooseFilter(page, "Tất cả học viên");
  await expect(options(page)).toHaveCount(4);

  // The search, accent-free as a teacher types it; no match says so.
  const search = picker(page).getByRole("combobox", { name: /Tìm theo tên/ });
  await search.fill("khong ai");
  await expect(
    picker(page).getByText("Không có học viên nào khớp với “khong ai”."),
  ).toBeVisible();
  await search.fill("nam");
  await expect(options(page)).toHaveCount(1);
  expect(lastAsked(world).get("q")).toBe("nam");

  // A row with a thread opens it, with the composer focused.
  await option(page, NAM.name).click();
  await expect(picker(page)).toBeHidden();
  await expect(page).toHaveURL(`/teacher/messages/student/${NAM.id}`);
  const stream = page.getByRole("log");
  await expect(stream.getByText("Dạ em cảm ơn ạ.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: composerName(NAM) })).toBeFocused();

  // A student in no class has no thread: the empty one opens, and the first post makes it.
  await openPicker(page);
  await search.fill("chau");
  await expect(options(page)).toHaveCount(1);
  await search.press("ArrowDown");
  await expect(option(page, CHAU.name)).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(page).toHaveURL(`/teacher/messages/student/${CHAU.id}`);
  const header = page.getByRole("region", { name: CHAU.name });
  await expect(header.getByText("Chưa vào lớp nào", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa có tin nhắn.", { exact: true })).toBeVisible();
  const box = page.getByRole("textbox", { name: composerName(CHAU) });
  await expect(box).toBeFocused();
  const text = "Chào Châu, tuần sau em vào lớp IELTS Foundation A nhé.";
  await box.fill(text);
  await box.press("Enter");
  await expect(stream.getByText(text, { exact: true })).toBeVisible();
  expect(world.posts).toEqual([
    {
      path: `/teacher/messages/students/${CHAU.id}`,
      body: expect.objectContaining({ body: text }) as Post,
    },
  ]);
});

test("Colleagues: the tab and its count, a thread with a file, a disabled account, and a new colleague thread", async ({
  page,
}) => {
  const world = await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/teacher/messages");
  const list = page.getByRole("complementary", { name: "Cuộc trò chuyện" });
  const tabs = list.getByRole("group", { name: "Lọc cuộc trò chuyện" });

  // All merges the two lists newest first: Nam (20:32), Đức (20:10), the channel, Vân.
  await expect(list.getByRole("link")).toHaveCount(4);
  await expect(list.getByRole("link").nth(0)).toContainText(NAM.name);
  await expect(list.getByRole("link").nth(1)).toContainText(DUC.name);
  await expect(list.getByRole("link").nth(2)).toContainText(EVENING.name);
  await expect(list.getByRole("link").nth(3)).toContainText(VAN.name);

  // The Colleagues tab lists only colleagues, with its own unread count.
  const colleaguesTab = tabs.getByRole("button", { name: /^Đồng nghiệp/ });
  await expect(colleaguesTab).toContainText("1");
  await colleaguesTab.click();
  await expect(list.getByRole("link")).toHaveCount(2);
  await expect(list.getByRole("link").nth(0)).toContainText("1 tin nhắn chưa đọc");

  // Đức's thread: his PDF, the role under his name, no "Seen by"; reading clears the count.
  await list.getByRole("link").filter({ hasText: DUC.name }).click();
  await expect(page).toHaveURL(`/teacher/messages/colleagues/${DUC.id}`);
  const thread = page.getByRole("region", { name: DUC.name });
  await expect(thread.getByText("Giáo viên", { exact: true })).toBeVisible();
  const stream = page.getByRole("log");
  await expect(
    stream.getByRole("button", { name: `Tải xuống ${CUE.filename}` }),
  ).toBeVisible();
  await expect(stream.getByText(/học viên đã xem/)).toHaveCount(0);
  await expect
    .poll(() => world.reads)
    .toContain(`/teacher/messages/colleagues/${DUC.id}/read`);
  await expect(colleaguesTab).not.toContainText("1");

  const reply = "Em thử xong nhắn chị nhé.";
  const box = page.getByRole("textbox", { name: composerName(DUC) });
  await box.fill(reply);
  await box.press("Enter");
  await expect(stream.getByText(reply, { exact: true })).toBeVisible();
  expect(world.posts.at(-1)).toEqual({
    path: `/teacher/messages/colleagues/${DUC.id}`,
    body: expect.objectContaining({ body: reply }) as Post,
  });

  // A disabled colleague's thread stays readable and takes no post.
  await list.getByRole("link").filter({ hasText: VAN.name }).click();
  await expect(page).toHaveURL(`/teacher/messages/colleagues/${VAN.id}`);
  await expect(
    page.getByText(`Tài khoản của ${VAN.name} đã bị vô hiệu hoá nên không nhắn được.`),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: composerName(VAN) })).toHaveCount(0);

  // New message's colleagues: Trang has no thread, so hers opens empty.
  await openPicker(page);
  await picker(page)
    .getByRole("group", { name: "Tin nhắn mới" })
    .getByRole("button", { name: "Đồng nghiệp" })
    .click();
  await expect(options(page)).toHaveCount(2);
  await expect(
    picker(page).getByRole("combobox", { name: "Lọc học viên" }),
  ).toHaveCount(0);
  await expect(option(page, DUC.name)).toContainText("Đã có cuộc trò chuyện");
  await expect(option(page, TRANG.name)).toContainText("Giáo viên");
  expect(lastAsked(world).get("audience")).toBe("colleagues");
  await option(page, TRANG.name).click();
  await expect(page).toHaveURL(`/teacher/messages/colleagues/${TRANG.id}`);
  await expect(
    page.getByText(
      `Chưa có tin nhắn. Chỉ bạn và ${TRANG.name} đọc được cuộc trò chuyện này.`,
    ),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: composerName(TRANG) })).toBeFocused();

  // The list's search finds a colleague with no thread under its own heading.
  await page.getByRole("searchbox", { name: "Tìm người và lớp" }).fill("trang");
  await expect(
    list.getByText("Đồng nghiệp chưa nhắn tin", { exact: true }),
  ).toBeVisible();
  await expect(list.getByRole("link").filter({ hasText: TRANG.name })).toBeVisible();
});
