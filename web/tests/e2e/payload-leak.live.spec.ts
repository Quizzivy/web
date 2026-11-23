import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  API,
  apiAuth,
  apiResponse,
  ASSIGNMENT,
  centreDay,
  EVENING_CLASS,
  freshAttempt,
  GIA_BAO,
  goToQuestion,
  gradeAttempt,
  signIn,
  signInAsAdmin,
  MINH_ANH,
  sharedApiAuth,
  signInAsStudent,
  submitAttempt,
  TEACHER,
} from "./support/live";

/**
 * E2E 9 (§14, §13.5): the payload a student's browser receives for their own
 * attempt carries no `isCorrect`, `sampleAnswer`, `transcript` or
 * `acceptedAnswers`, at any depth. The Go side pins the same thing on the
 * domain type; this reads the bytes that actually crossed the wire.
 *
 * Since R6 (T-R6.14) it reads the paper with a question of every type, and
 * the session payload also carries none of the keys that only the result may
 * show: the correct answers, matches and options, an essay's band and its
 * criteria, and the explanation with its media. A second case reads a graded
 * result whose assignment hides the score, the answers and the explanations,
 * and finds none of them there either.
 *
 * Since R7 (T-R7.24) it also walks a student's Messages, the list, a class
 * channel and a direct thread, which carry none of those keys nor the
 * teacher's own: the read receipts (`seenBy`), the attempt events beside a
 * thread (`contextEvents`) and a class's member count.
 *
 * Since R8 (T-R8.16) it walks a student's Classes and This week, which say
 * when and where a class meets and carry no count, roster or attendance, and
 * reads the public join preview of a class whose dates hold a note, a
 * cancellation and a one-off: the weekly pattern and the room, nothing else.
 */
const BANNED = new Set(["iscorrect", "sampleanswer", "transcript", "acceptedanswers"]);
const RESULT_ONLY = new Set([
  "correctoptionids",
  "correctanswers",
  "correctmatches",
  "correctoptionid",
  "band",
  "criteria",
  "explanation",
  "explanationcontent",
  "explanationassets",
]);

function offendingPaths(node: unknown, banned: Set<string>, path = "$"): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => offendingPaths(child, banned, `${path}[${i}]`));
  }
  if (node !== null && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) => {
      const here = `${path}.${key}`;
      const own = banned.has(key.toLowerCase()) ? [here] : [];
      return [...own, ...offendingPaths(child, banned, here)];
    });
  }
  return [];
}

const both = new Set([...BANNED, ...RESULT_ONLY]);

/** The API's response to GET `path`, not the SPA document that shares it. */
function apiRead(page: Page, path: string) {
  return apiResponse(page, "GET", path);
}

/** What only staff read of a conversation: read receipts, attempt events, member counts. */
const STAFF_ONLY = new Set(["seenby", "contextevents", "studentcount", "membercount"]);
const MESSAGES_BANNED = new Set([...BANNED, ...STAFF_ONLY]);

/** seed/08's Lê Hoàng Nam: his thread with Lan has the flagged attempt beside it. */
const NAM = { email: "nam.le@quizzivy.com", password: "quizzivy-dev" };
const LAN_ID = "01935000-0000-7000-8000-000000000601";

interface StudentThreadRow {
  thread: { kind: "class" | "direct"; classId?: string; teacherId?: string };
}

/** readAs is a GET of `path` with `headers` (apiAuth's), which must answer 200. */
async function readAs(
  api: APIRequestContext,
  headers: Record<string, string>,
  path: string,
) {
  const response = await api.get(`${API}${path}`, { headers });
  expect(response.status(), path).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

/** Lan's own reads of the same two threads, which hold every staff-only key. */
async function staffSide(api: APIRequestContext, classId: string) {
  const lan = await apiAuth(api, TEACHER);
  const get = (path: string) => readAs(api, lan, path);
  const list = (await get("/teacher/messages/threads")) as {
    threads: { title: string; studentCount?: number; thread: { studentId?: string } }[];
  };
  const nam = list.threads.find((row) => row.title === "Lê Hoàng Nam");
  expect(nam?.thread.studentId, "Nam's thread in Lan's list").toBeTruthy();
  return {
    list,
    channel: (await get(`/teacher/messages/classes/${classId}`)) as {
      messages: { seenBy?: unknown }[];
    },
    direct: (await get(`/teacher/messages/students/${nam!.thread.studentId!}`)) as {
      contextEvents?: unknown[];
    },
  };
}

test("E2E 9: GET /app/attempts/:id contains no part of the grading key", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAsStudent(page);
  const attemptId = await freshAttempt(page, ASSIGNMENT.payload);
  // As below: the engine's own first read lands before the awaited one.
  await expect(page.getByRole("group", { name: "Câu 1", exact: true })).toBeVisible();

  const read = apiRead(page, `/app/attempts/${attemptId}`);
  await page.reload({ waitUntil: "commit" });
  const response = await read;
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();

  // The paper is really there, so an empty payload cannot pass by accident.
  const questions = (body as { questions?: unknown[] }).questions ?? [];
  expect(questions.length).toBeGreaterThan(0);
  expect(offendingPaths(body, BANNED)).toEqual([]);
});

test("E2E 9: the every-type paper's session carries no result-only key", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAsStudent(page);
  const attemptId = await freshAttempt(page, ASSIGNMENT.everyType.payload);
  // The engine's own first read has landed, so the one awaited below is the
  // reload's and its body is still there to read.
  await expect(page.getByRole("group", { name: "Câu 1", exact: true })).toBeVisible();

  const read = apiRead(page, `/app/attempts/${attemptId}`);
  await page.reload({ waitUntil: "commit" });
  const response = await read;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    questions?: { type: string; matchItems?: unknown[]; promptAssets?: unknown[] }[];
  };

  // Every type is on the paper, with the parts that carry a key: matching
  // items and the prompt's image. So a key left out cannot pass for absent.
  const questions = body.questions ?? [];
  expect(new Set(questions.map((question) => question.type))).toEqual(
    new Set([
      "tfng",
      "matching",
      "true_false",
      "single_choice",
      "multiple_choice",
      "fill_blank",
      "short_answer",
      "essay",
    ]),
  );
  expect(questions.find((q) => q.type === "matching")?.matchItems).toHaveLength(3);
  expect(questions.find((q) => q.type === "single_choice")?.promptAssets).toHaveLength(
    1,
  );
  expect(offendingPaths(body, both)).toEqual([]);
});

test("E2E 9: a graded result with the score, answers and explanations hidden carries none of them", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const student = await browser.newPage();
  await signInAsStudent(student);
  const attemptId = await freshAttempt(student, ASSIGNMENT.everyType.hidden);
  await goToQuestion(student, 7);
  await student.getByRole("textbox", { name: "Bài làm của bạn" }).fill("Rice");
  await goToQuestion(student, 8);
  await student
    .getByRole("textbox", { name: "Bài luận của bạn" })
    .fill("Rivers feed the delta, so they matter more than new roads.");
  await expect(student.getByText("Đã lưu tất cả câu trả lời")).toBeVisible();
  await submitAttempt(student);

  // A graded essay is what would put a band and criteria on the result.
  const teacher = await browser.newPage();
  await signInAsAdmin(teacher);
  await gradeAttempt(teacher, attemptId, {
    shortAnswer: "1",
    bands: ["6,0", "6,5", "7,0", "6,0"],
    comment: "Clear view; give an example for each side.",
  });
  await teacher.close();

  const read = apiRead(student, `/app/attempts/${attemptId}/result`);
  await student.goto(`/attempts/${attemptId}/result`);
  const response = await read;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    review?: Record<string, unknown>;
    questions?: { type: string; answer?: unknown }[];
  };
  expect(body.review).toMatchObject({
    showScore: false,
    showCorrectAnswers: false,
    showExplanations: false,
  });
  // The essay was answered and graded, so its band was there to leak.
  const essay = body.questions?.find((question) => question.type === "essay");
  expect(essay?.answer).toBeTruthy();
  expect(offendingPaths(body, both)).toEqual([]);
});

test("E2E 9: a student's Messages carry no part of the grading key and nothing only staff read", async ({
  page,
  playwright,
}) => {
  test.setTimeout(120_000);
  await signIn(page, NAM, /\/$/);

  const listed = apiRead(page, "/app/messages/threads");
  await page.goto("/messages");
  const listResponse = await listed;
  expect(listResponse.status()).toBe(200);
  const list = (await listResponse.json()) as { threads: StudentThreadRow[] };
  const channel = list.threads.find((row) => row.thread.kind === "class")?.thread;
  const direct = list.threads.find(
    (row) => row.thread.kind === "direct" && row.thread.teacherId === LAN_ID,
  )?.thread;
  expect(channel?.classId, "a class channel in Nam's list").toBeTruthy();
  expect(direct, "Lan's thread in Nam's list").toBeTruthy();
  expect(offendingPaths(list, MESSAGES_BANNED)).toEqual([]);

  // The same threads as Lan reads them hold every key looked for, so a key
  // left out of the student's side cannot pass for one no side has.
  const api = await playwright.request.newContext();
  try {
    const staff = await staffSide(api, channel!.classId!);
    expect(staff.list.threads.some((row) => typeof row.studentCount === "number")).toBe(
      true,
    );
    expect(staff.channel.messages.some((message) => message.seenBy !== undefined)).toBe(
      true,
    );
    expect(staff.direct.contextEvents?.length ?? 0).toBeGreaterThan(0);
  } finally {
    await api.dispose();
  }

  for (const [screen, path] of [
    [
      `/messages/class/${channel!.classId!}`,
      `/app/messages/classes/${channel!.classId!}`,
    ],
    [`/messages/teacher/${LAN_ID}`, `/app/messages/teachers/${LAN_ID}`],
  ] as const) {
    const opened = apiRead(page, path);
    await page.goto(screen);
    const response = await opened;
    expect(response.status(), path).toBe(200);
    const body = (await response.json()) as { messages?: unknown[] };
    // The thread has posts, so an empty one cannot pass by accident.
    expect(body.messages?.length ?? 0, path).toBeGreaterThan(0);
    expect(offendingPaths(body, MESSAGES_BANNED), path).toEqual([]);
    await expect(page.getByRole("log")).toBeVisible();
  }
});

/**
 * What a student's Classes and This week never carry: a class's counts and
 * join code, its roster, and anyone's attendance, their own included.
 */
const TIMETABLE_BANNED = new Set([
  ...BANNED,
  "studentcount",
  "membercount",
  "openassignmentcount",
  "averagescore",
  "joincode",
  "members",
  "students",
  "counts",
  "rate",
  "status",
  "hasattendance",
  "marked",
  "notmarked",
]);

interface StudentClassRow {
  id: string;
  name: string;
  room: string | null;
  schedule: { slots: unknown[] };
}

type WeekRow = { kind: string; note?: string | null };

test("E2E 9: a student's Classes and This week say when and where, with no count, roster or attendance", async ({
  page,
  playwright,
}) => {
  test.setTimeout(120_000);
  await signIn(page, GIA_BAO, /\/$/);

  const listed = apiRead(page, "/app/classes");
  await page.goto("/classes");
  const classesResponse = await listed;
  expect(classesResponse.status()).toBe(200);
  const classes = (await classesResponse.json()) as { items: StudentClassRow[] };
  // seed/13's IELTS 6.5 Evening meets three times a week, so the slots are there to read.
  const evening = classes.items.find((row) => row.id === EVENING_CLASS);
  expect(evening?.schedule.slots, "IELTS 6.5 Evening's slots").toHaveLength(3);
  expect(offendingPaths(classes, TIMETABLE_BANNED)).toEqual([]);
  await expect(
    page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "IELTS 6.5 Evening", exact: true }),
    }),
  ).toContainText("T2 · T4 · T6, 18:00 · Room 3");

  const read = apiRead(page, "/app/week");
  await page.getByRole("link", { name: "Tuần này", exact: true }).click();
  await expect(page).toHaveURL(/\/week$/);
  const weekResponse = await read;
  expect(weekResponse.status()).toBe(200);
  const week = (await weekResponse.json()) as { days: { items: WeekRow[] }[] };
  // seed/13: five sessions this week, one with the note "Room 3 this week".
  const sessions = week.days.flatMap((day) =>
    day.items.filter((item) => item.kind === "session"),
  );
  expect(sessions.length).toBeGreaterThanOrEqual(5);
  expect(sessions.map((item) => item.note)).toContain("Room 3 this week");
  expect(offendingPaths(week, TIMETABLE_BANNED)).toEqual([]);
  await expect(
    page.getByRole("link").filter({ hasText: "Room 3 this week" }),
  ).toBeVisible();

  // Lan's reads of the same class hold every key looked for, so a key left
  // out of the student's side cannot pass for one no side has.
  const api = await playwright.request.newContext();
  try {
    const lan = await sharedApiAuth(api, TEACHER);
    const get = (path: string) => readAs(api, lan, path);
    const klass = await get(`/teacher/classes/${EVENING_CLASS}`);
    expect(typeof klass["studentCount"]).toBe("number");
    const taken = (await get(
      `/teacher/attendance/sessions?classId=${EVENING_CLASS}&marked=true&limit=1`,
    )) as { items: { id: string; studentCount: number; counts: unknown }[] };
    expect(taken.items[0]?.counts, "a marked session's counts").toBeTruthy();
    const register = (await get(
      `/teacher/sessions/${encodeURIComponent(taken.items[0]!.id)}/attendance`,
    )) as { students: { status: string | null; rate: number | null }[] };
    expect(
      register.students.some((row) => row.status !== null && row.rate !== null),
    ).toBe(true);
  } finally {
    await api.dispose();
  }
});

/**
 * What the public join preview never carries (§6.5, DG-02, D5): a session's
 * date, time, note or cancellation, a series' own id and dates, and any
 * count, member or mark.
 */
const PREVIEW_BANNED = new Set([
  ...TIMETABLE_BANNED,
  "id",
  "seriesid",
  "sessions",
  "date",
  "startsat",
  "startson",
  "endson",
  "note",
  "cancelled",
  "changed",
  "code",
]);

test("E2E 9: the join preview carries the weekly pattern and the room, never a date, a note or a count", async ({
  playwright,
}) => {
  const api = await playwright.request.newContext();
  const lan = await sharedApiAuth(api, TEACHER);
  const today = centreDay();
  const created = await api.post(`${API}/teacher/classes`, {
    headers: lan,
    data: { name: `Xem trước ${Date.now()}`, room: "Phòng 4" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const classId = ((await created.json()) as { id: string }).id;
  try {
    const post = async (path: string, data: unknown, status = 201) => {
      const response = await api.post(`${API}${path}`, { headers: lan, data });
      expect(response.status(), `${path}: ${await response.text()}`).toBe(status);
      return (await response.json()) as Record<string, unknown>;
    };
    // A weekly session whose first date is cancelled with a note, a one-off
    // tomorrow, and a member: every thing the preview must leave out exists.
    const weekly = await post(`/teacher/classes/${classId}/sessions`, {
      date: today.date,
      startTime: "18:00",
      durationMinutes: 90,
      repeatWeekly: true,
    });
    await post(`/teacher/classes/${classId}/sessions`, {
      date: centreDay(1).date,
      startTime: "08:00",
      durationMinutes: 60,
      repeatWeekly: false,
    });
    const changed = await api.patch(
      `${API}/teacher/sessions/${encodeURIComponent(String(weekly["id"]))}`,
      { headers: lan, data: { note: "Mang tai nghe", cancelled: true } },
    );
    expect(changed.status(), await changed.text()).toBe(200);
    const { code } = (await post(`/teacher/classes/${classId}/join-code`, {})) as {
      code: string;
    };
    const joined = await api.post(`${API}/app/classes/join`, {
      headers: await sharedApiAuth(api, MINH_ANH),
      data: { joinCode: code },
    });
    expect(joined.status(), await joined.text()).toBe(200);

    // No Authorization header: the preview is public.
    const previewed = await api.post(`${API}/join/preview`, {
      data: { joinCode: code },
    });
    expect(previewed.status()).toBe(200);
    const preview = (await previewed.json()) as Record<string, unknown>;
    expect(Object.keys(preview).sort((a, b) => a.localeCompare(b))).toEqual([
      "classId",
      "className",
      "room",
      "schedule",
      "teacherName",
    ]);
    expect(preview["schedule"]).toEqual({
      slots: [{ weekday: today.weekday, startTime: "18:00", durationMinutes: 90 }],
      label: null,
    });
    expect(preview["room"]).toBe("Phòng 4");
    expect(offendingPaths(preview, PREVIEW_BANNED)).toEqual([]);

    // The teacher's own read of those dates holds the note, the cancellation
    // and the one-off, so the preview had them to leak.
    const calendar = await api.get(
      `${API}/teacher/calendar?from=${today.date}&to=${centreDay(2).date}&classId=${classId}`,
      { headers: lan },
    );
    expect(calendar.status()).toBe(200);
    const { sessions } = (await calendar.json()) as {
      sessions: { note: string | null; cancelled: boolean; seriesId: string | null }[];
    };
    expect(sessions).toMatchObject([
      { note: "Mang tai nghe", cancelled: true },
      { seriesId: null, cancelled: false },
    ]);
  } finally {
    const archived = await api.patch(`${API}/teacher/classes/${classId}`, {
      headers: lan,
      data: { archived: true },
    });
    expect(archived.status()).toBe(200);
    await api.dispose();
  }
});
