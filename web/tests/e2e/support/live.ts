import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Shared by the live specs, which talk to a real API over the seeded database. */

export const ADMIN = { email: "thuong@quizzivy.com", password: "quizzivy-dev" };
export const STUDENT = { email: "hocvien@quizzivy.com", password: "quizzivy-dev" };
export const TEACHER = { email: "giaovien@quizzivy.com", password: "quizzivy-dev" };
/** seed/06's second teacher, Lê Văn Minh, who shares with TEACHER both ways (seed/11). */
export const TEACHER_2 = { email: "giaovien2@quizzivy.com", password: "quizzivy-dev" };

/** The live API's origin, the one the build is pointed at (playwright.config.ts). */
export const API = "http://localhost:8080";

/**
 * apiAuth signs `who` in on the API directly and answers the header that
 * carries the access token, for a spec's setup or for a read the screen does
 * not show. A browser signed in as the same account keeps its own session.
 */
export async function apiAuth(
  api: APIRequestContext,
  who: typeof ADMIN,
): Promise<Record<string, string>> {
  const response = await api.post(`${API}/auth/login`, {
    data: { email: who.email, password: who.password },
  });
  expect(response.status(), `the API sign-in of ${who.email}`).toBe(200);
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * The API lets one account sign in twenty times an hour (POST /auth/login's
 * perEmail bucket), and the live suite signs the seeded accounts in close to
 * that already. sharedApiAuth signs `who` in once per worker and hands the
 * same header to every caller until the access token (fifteen minutes) is
 * near its end, for the specs that only read and write through the API.
 */
const sharedTokens = new Map<
  string,
  { header: Promise<Record<string, string>>; at: number }
>();
const SHARED_TOKEN_MS = 10 * 60_000;

export function sharedApiAuth(
  api: APIRequestContext,
  who: typeof ADMIN,
): Promise<Record<string, string>> {
  const held = sharedTokens.get(who.email);
  if (held !== undefined && Date.now() - held.at < SHARED_TOKEN_MS) return held.header;
  const header = apiAuth(api, who);
  sharedTokens.set(who.email, { header, at: Date.now() });
  header.catch(() => sharedTokens.delete(who.email));
  return header;
}

/**
 * apiResponse waits for the API's answer to `method` on `path` itself: not
 * the SPA document that shares a path, not a preflight, and not a poll of the
 * same path with `?after=` or a page of it with `?before=`. Start it before
 * the action that sends the request.
 */
export function apiResponse(page: Page, method: string, path: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === method &&
      url.origin === API &&
      url.pathname === path &&
      !url.searchParams.has("after") &&
      !url.searchParams.has("before")
    );
  });
}

/** The assignments seed/04-dev-e2e.sql exists to provide. */
export const ASSIGNMENT = {
  timer: "01935000-0000-7000-8000-00000000ee01",
  integrity: "01935000-0000-7000-8000-00000000ee02",
  takeover: "01935000-0000-7000-8000-00000000ee03",
  persistence: "01935000-0000-7000-8000-00000000ee05",
  payload: "01935000-0000-7000-8000-00000000ee09",
  /** seed/10-dev-question-types.sql: the paper with a question of every type. */
  everyType: {
    run: "01935000-0000-7000-8000-000000001007",
    payload: "01935000-0000-7000-8000-000000001008",
    hidden: "01935000-0000-7000-8000-000000001009",
  },
  /**
   * seed/12-dev-flexible.sql: a flexible assignment of 02's paper (a single
   * choice whose right option is "went", and a short answer), open to the
   * seeded student for thirty days, fifty attempts, the Admin its teacher.
   * The time limit and the leaving rule it stores are one minute and a
   * submit on the second absence, which flexible never applies.
   */
  flexible: "01935000-0000-7000-8000-000000001201",
};

/** STUDENT's user id in seed/01, for a spec that assigns to the student alone. */
export const STUDENT_ID = "01935000-0000-7000-8000-0000000000a2";

/** 02's published version: the paper ASSIGNMENT.flexible sets, for a spec's own assignment. */
export const FLEXIBLE_PAPER_VERSION = "01935000-0000-7000-8000-00000000dd02";

/**
 * createFlexibleAssignment assigns 02's paper to the seeded student alone as
 * the Admin (`admin`, an apiAuth header), through the API: flexible, open
 * from a minute ago until `closesAt`, one attempt, no fullscreen, and the
 * stored time limit `durationMinutes`, one minute unless given, so that a
 * flexible attempt which applied it would show. It answers the id.
 */
export async function createFlexibleAssignment(
  api: APIRequestContext,
  admin: Record<string, string>,
  { closesAt, durationMinutes = 1 }: { closesAt: Date; durationMinutes?: number },
): Promise<string> {
  const created = await api.post(`${API}/teacher/assignments`, {
    headers: admin,
    data: {
      testVersionId: FLEXIBLE_PAPER_VERSION,
      targets: { classIds: [], studentIds: [STUDENT_ID] },
      window: {
        opensAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: closesAt.toISOString(),
      },
      mode: "flexible",
      durationMinutes,
      maxAttempts: 1,
      shuffleQuestions: false,
      shuffleOptions: false,
      review: { showScore: true, showCorrectAnswers: false, showExplanations: false },
      integrity: {
        requireFullscreen: false,
        blockCopyPaste: false,
        maxFocusLoss: 1,
        onLimitExceeded: "auto_submit",
        minAwayMs: 3000,
      },
      draft: false,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const assignment = (await created.json()) as { id: string; mode: string };
  expect(assignment.mode).toBe("flexible");
  return assignment.id;
}

/**
 * takeBreak leaves a flexible paper by its × (F1), which the header names
 * "Tạm nghỉ", through the "Tạm nghỉ?" dialog, and lands on Home.
 */
export async function takeBreak(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Tạm nghỉ", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Tạm nghỉ?" });
  await expect(dialog).toContainText("Bạn có thể quay lại làm tiếp");
  await dialog.getByRole("button", { name: "Tạm nghỉ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** What the teacher's API says of one attempt: GET /teacher/attempts/{id}. */
export interface ReviewedAttempt {
  attempt: {
    status: string;
    startedAt: string;
    deadlineAt: string;
    submittedAt?: string | null;
    integrity?: { focusLossCount: number; flagged: boolean } | null;
  };
  answers: Record<string, { answer: unknown }>;
  activeSeconds?: number | null;
}

/**
 * reviewAttempt reads one attempt as the Admin, its teacher in the seed, with
 * `admin`, apiAuth's header: signed in once, since a spec polls this.
 */
export async function reviewAttempt(
  api: APIRequestContext,
  admin: Record<string, string>,
  attemptId: string,
): Promise<ReviewedAttempt> {
  const response = await api.get(`${API}/teacher/attempts/${attemptId}`, {
    headers: admin,
  });
  expect(response.status(), `the review of ${attemptId}`).toBe(200);
  return (await response.json()) as ReviewedAttempt;
}

/** One event of an attempt's timeline, as the teacher's API lists it. */
export interface TimelineEvent {
  kind: string;
  occurredAt: string;
}

/** attemptEvents is the attempt's timeline as the teacher's API orders it. */
export async function attemptEvents(
  api: APIRequestContext,
  admin: Record<string, string>,
  attemptId: string,
): Promise<TimelineEvent[]> {
  const response = await api.get(`${API}/teacher/attempts/${attemptId}/events`, {
    headers: admin,
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { events: TimelineEvent[] }).events;
}

/**
 * sameTabBreakMs is how long the attempt's first break lasted when it was
 * returned to in the same tab (F1): from its paper_left to the paper_returned
 * after it. That tab still holds its session, so nothing after the break may
 * be a resume or a takeover.
 */
export function sameTabBreakMs(events: TimelineEvent[]): number {
  const leftAt = events.findIndex((event) => event.kind === "paper_left");
  expect(leftAt, "paper_left on the server").toBeGreaterThanOrEqual(0);
  const after = events.slice(leftAt + 1);
  const kinds = after.map((event) => event.kind);
  expect(kinds, "no resume and no takeover after the break").not.toContain("resume");
  expect(kinds).not.toContain("session_takeover");
  const returned = after.find((event) => event.kind === "paper_returned");
  expect(returned, "paper_returned after the break").toBeDefined();
  return (
    new Date(returned!.occurredAt).getTime() -
    new Date(events[leftAt]!.occurredAt).getTime()
  );
}

/** spokenSpan words a span as the timeline's compact rows do: "6 giây", "1 phút 5 giây". */
export function spokenSpan(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} giây`;
  if (seconds === 0) return `${minutes} phút`;
  return `${minutes} phút ${seconds} giây`;
}

export async function signIn(page: Page, who: typeof ADMIN, landing: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(landing);
}

export const signInAsStudent = (page: Page) => signIn(page, STUDENT, /\/$/);

/**
 * emailSinkDir is the directory the API's email sink writes to: EMAIL_SINK_DIR,
 * which playwright.config.ts resolves and sets for every worker.
 */
export function emailSinkDir(): string {
  const dir = process.env["EMAIL_SINK_DIR"];
  if (!dir) throw new Error("EMAIL_SINK_DIR is unset: playwright.config.ts sets it");
  return dir;
}

interface SunkMessage {
  to: string;
  text: string;
  tags?: Record<string, string>;
}

const SET_PASSWORD_LINK = /(https?:\/\/[^\s/]+)\/set-password#token=([A-Za-z0-9_-]+)/;

async function sunkMessages(): Promise<SunkMessage[]> {
  const dir = emailSinkDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const files = names
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  return Promise.all(
    files.map(
      async (name) =>
        JSON.parse(await readFile(path.join(dir, name), "utf8")) as SunkMessage,
    ),
  );
}

/**
 * setPasswordLink waits up to 30 seconds for the sink to hold a message of
 * `template` to `email` and answers the newest one's set-password link in two
 * parts: the origin it points into, which is the web host the recipient
 * belongs at (the API's STUDENT_APP_URL or STAFF_APP_URL), and its token.
 */
export async function setPasswordLink(
  email: string,
  template = "account_invite",
): Promise<{ origin: string; token: string }> {
  let link = { origin: "", token: "" };
  await expect
    .poll(
      async () => {
        const sent = (await sunkMessages()).filter(
          (message) =>
            message.to.toLowerCase() === email.toLowerCase() &&
            message.tags?.["template"] === template,
        );
        const found = SET_PASSWORD_LINK.exec(sent.at(-1)?.text ?? "");
        link = { origin: found?.[1] ?? "", token: found?.[2] ?? "" };
        return link.token;
      },
      {
        message: `a ${template} message to ${email} in ${emailSinkDir()}`,
        timeout: 30_000,
      },
    )
    .not.toBe("");
  return link;
}

/**
 * setPasswordToken is the token of `setPasswordLink` alone, for a spec that
 * opens the link on the origin it runs on, where one host serves every page.
 */
export async function setPasswordToken(
  email: string,
  template = "account_invite",
): Promise<string> {
  return (await setPasswordLink(email, template)).token;
}
/**
 * signInAsAdmin signs in as the seeded Admin, who opens the Admin console the
 * first time and the teacher's console after switching, and ends in the
 * teacher's console, where the specs author and assign.
 */
export async function signInAsAdmin(page: Page) {
  await signIn(page, ADMIN, /\/(admin|teacher)$/);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/teacher$/);
}

/**
 * Opens an assignment by id and starts or resumes it, returning the attempt id.
 *
 * By id rather than by clicking the card: the fixtures share one test title, so
 * the home offers three cards that read the same.
 */
export async function startAttempt(page: Page, assignmentId: string): Promise<string> {
  await page.goto(`/assignments/${assignmentId}`);
  const start = page.getByRole("button", {
    name: /^(Bắt đầu làm bài|Tiếp tục làm bài)$/,
  });
  await expect(start).toBeVisible();
  const asks = ((await start.textContent()) ?? "").includes("Bắt đầu");
  await start.click();
  if (asks) {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Bắt đầu", exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]+$/);
  return page.url().split("/").pop() ?? "";
}

/**
 * A brand-new attempt, whatever the last run left behind.
 *
 * A spec that asserts on counters has to start from zero, and the fixtures
 * allow fifty attempts precisely so each run can have its own. Any attempt
 * still live from a previous run is submitted first, because submitting is the
 * only way the product ends one.
 */
export async function freshAttempt(page: Page, assignmentId: string): Promise<string> {
  await page.goto(`/assignments/${assignmentId}`);
  // Waited for, not polled: isVisible() answers before the intro has rendered,
  // and the resume branch was silently skipped every run.
  const control = page.getByRole("button", {
    name: /^(Bắt đầu làm bài|Tiếp tục làm bài)$/,
  });
  await expect(control).toBeVisible();
  if (((await control.textContent()) ?? "").includes("Tiếp tục")) {
    await control.click();
    await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]+$/);
    await submitAttempt(page);
  }
  return startAttempt(page, assignmentId);
}

/** Hands the open attempt in through the Submit dialog and goes home. */
export async function submitAttempt(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Nộp bài", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: /^Nộp bài/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bài đã được nộp." })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Về trang chủ" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/**
 * One away episode, as the monitor sees it: blur, then focus.
 *
 * The hook listens to both visibilitychange and window blur/focus and treats
 * them as one absence, so a blur/focus pair is an episode whether or not the
 * browser really backgrounded the tab. Playwright cannot hide a page it is
 * driving, which is why this drives the events the hook actually binds.
 */
export async function goAway(page: Page, ms: number) {
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

/**
 * waitUntil lets real time pass until `moment` (milliseconds since the
 * epoch), for a spec whose subject is time itself: a close that has to pass,
 * a break that has to last. Nothing on the page changes until then, so
 * there is no condition to wait on instead.
 */
export async function waitUntil(page: Page, moment: number) {
  const left = moment - Date.now();
  if (left > 0) await page.waitForTimeout(left);
}

/**
 * Picks a choice option by its text.
 *
 * The radio itself is `sr-only`, so it is the label that gets clicked — which
 * is what a student clicks too.
 */
export async function chooseOption(page: Page, text: string) {
  await page.locator("label").filter({ hasText: text }).click();
}

/** The Admin's class from seed/01, which the wizard specs assign to. */
const SEEDED_CLASS = /Tiếng Anh giao tiếp/;

/**
 * Assigns a published test to the seeded class (or `classroom`) through the
 * wizard, with every other choice left at its default, and lands on the list.
 * `query` is pickInWizard's.
 */
export async function assignToClass(
  page: Page,
  title: string,
  query = "",
  classroom: RegExp = SEEDED_CLASS,
) {
  await pickInWizard(page, title, query, classroom);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: /^Giao (cho \d+ học viên|bài)$/ }).click();
  await expect(page).toHaveURL(/\/teacher\/assignments\?status=(open|scheduled)$/, {
    timeout: 30_000,
  });
  await page.goto("/teacher/assignments");
}

/**
 * Opens the new-assignment wizard with `query` (such as `?test=<id>`), picks
 * `title` unless the query preselected it, ticks the seeded class (or
 * `classroom`) and stops on the Students step.
 */
export async function pickInWizard(
  page: Page,
  title: string,
  query = "",
  classroom: RegExp = SEEDED_CLASS,
) {
  await page.goto(`/teacher/assignments/new${query}`);
  const test = page.getByRole("radio", { name: new RegExp(title) });
  if (query.includes("test=")) await expect(test).toBeChecked();
  else await test.click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("checkbox", { name: classroom }).first().click();
}

/** Types `value` into the stepper named `name` and commits it with Enter. */
export async function fillStepper(page: Page, name: string, value: string) {
  const field = page.getByRole("spinbutton", { name });
  await field.fill(value);
  await field.press("Enter");
  await expect(field).toHaveAttribute("aria-valuenow", value);
}

/**
 * publishInBuilder publishes the open builder's draft through "Publish test?",
 * waits for the builder to say so, and opens the test's own page.
 */
export async function publishInBuilder(page: Page) {
  const id = new URL(page.url()).pathname.split("/").at(-2);
  await page.getByRole("button", { name: "Phát hành", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Phát hành đề thi?", exact: true });
  await dialog.getByRole("button", { name: "Phát hành", exact: true }).click();
  await expect(page.getByText("Đã phát hành. Giờ bạn có thể giao bài.")).toBeVisible({
    timeout: 30_000,
  });
  await page.goto(`/teacher/tests/${id}`);
}

/**
 * goToQuestion opens question `n` of the open attempt from the navigator,
 * whose buttons read "Câu n, <part>".
 */
export async function goToQuestion(page: Page, n: number) {
  await page.getByRole("button", { name: new RegExp(`^Câu ${n}, `) }).click();
  await expect(
    page.getByRole("group", { name: `Câu ${n}`, exact: true }),
  ).toBeVisible();
}

/**
 * gradeAttempt marks a submitted attempt of the every-type paper from the
 * teacher's attempt page, as a teacher grades one student's paper: the short
 * answer (question 7) in points, then the essay (question 8) one band per
 * rubric criterion, with a comment, and presses Finish grading. `bands` are
 * the four criteria's bands as the buttons write them ("6,5").
 */
export async function gradeAttempt(
  page: Page,
  attemptId: string,
  {
    shortAnswer,
    bands,
    comment,
  }: { shortAnswer: string; bands: string[]; comment: string },
) {
  await page.goto(`/teacher/attempts/${attemptId}`);
  const save = page.getByRole("button", { name: "Lưu & câu tiếp theo" });
  await page.getByRole("button", { name: /^Câu 7, / }).click();
  await page.getByRole("button", { name: shortAnswer, exact: true }).click();
  // Save & next lands on the essay once the mark is written; moving by hand
  // before then would ask whether to drop an unsaved mark.
  await save.click();
  await expect(page.getByText("Band theo tiêu chí", { exact: true })).toBeVisible();
  const criteria = [
    "Task response",
    "Coherence and cohesion",
    "Lexical resource",
    "Grammatical range and accuracy",
  ];
  for (const [index, label] of criteria.entries()) {
    await page
      .getByRole("group", { name: label, exact: true })
      .getByRole("button", { name: `Cho band ${bands[index]}`, exact: true })
      .click();
  }
  await page
    .getByRole("textbox", { name: "Nhận xét — học viên đọc được" })
    .fill(comment);
  await save.click();

  const finish = page.getByRole("button", { name: "Hoàn tất chấm", exact: true });
  // Paused (aria-disabled) until the last mark is saved.
  await expect(finish).not.toHaveAttribute("aria-disabled", "true", {
    timeout: 15_000,
  });
  await finish.click();
  await expect(
    page.getByRole("main").getByText("Đã chấm", { exact: true }),
  ).toBeVisible({
    timeout: 15_000,
  });
}
