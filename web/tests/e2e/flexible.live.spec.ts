import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  ADMIN,
  API,
  ASSIGNMENT,
  attemptEvents,
  chooseOption,
  createFlexibleAssignment,
  emailSinkDir,
  freshAttempt,
  goAway,
  reviewAttempt,
  sameTabBreakMs,
  sharedApiAuth,
  signInAsAdmin,
  signInAsStudent,
  spokenSpan,
  startAttempt,
  submitAttempt,
  takeBreak,
  waitUntil,
} from "./support/live";

/**
 * F1 (docs/plan/77f, T-F1.9): a flexible assignment, walked through the real
 * API. Its deadline is the student's close, the × is a break, an absence is
 * recorded and the teacher told, and nothing is ever submitted or locked
 * for it.
 *
 * The walk uses seed/12's assignment, whose stored rules would act at once
 * under strict: a submit on the second counted absence, and a one-minute
 * time limit. Its break lasts as long as signing in on the second device
 * takes, so the teacher's two times usually round to the same minute and
 * the sheet shows one; flexible-long-break.live.spec.ts, in the slow
 * project, holds a break past a minute and reads both.
 */

/** The seeded student's name, as the teacher's sheet titles it (seed/01). */
const STUDENT_NAME = /Nguyễn Văn An/;

/** An absence the server counts: past seed/12's minAwayMs of 3000. */
const AWAY_MS = 3_500;

/**
 * The close test's window, from just before its assignment is made: the start,
 * a save, a break returned to in the same tab, a second save and the last
 * break, on a loaded runner, with room to spare.
 */
const CLOSE_WINDOW_MS = 90_000;

/**
 * How long the close test waits for each of its saves and for each event to
 * reach the server, all of them together still inside CLOSE_WINDOW_MS.
 */
const SAVE_TIMEOUT_MS = 20_000;

/** How long the close test's same-tab break lasts: long enough to read in seconds. */
const SAME_TAB_BREAK_MS = 5_000;

/** The server's bucket for the repeats of attempt.flagged (FlaggedBucket). */
const FLAGGED_BUCKET_MS = 15 * 60_000;

interface Notice {
  kind: string;
  params: { focusLost?: number; studentName?: string };
  target: { attemptId?: string } | null;
  createdAt: string;
}

/** flaggedNotices is every attempt.flagged item the Admin holds for `attemptId`, oldest first. */
async function flaggedNotices(
  api: APIRequestContext,
  admin: Record<string, string>,
  attemptId: string,
): Promise<Notice[]> {
  const response = await api.get(`${API}/me/notifications?audience=teacher&limit=50`, {
    headers: admin,
  });
  expect(response.status()).toBe(200);
  const { items } = (await response.json()) as { items: Notice[] };
  return items
    .filter(
      (item) => item.kind === "attempt.flagged" && item.target?.attemptId === attemptId,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The focusLost each of the attempt's notices carries, oldest first. */
async function noticeCounts(
  api: APIRequestContext,
  admin: Record<string, string>,
  attemptId: string,
): Promise<number[]> {
  return (await flaggedNotices(api, admin, attemptId)).map(
    (item) => item.params.focusLost ?? -1,
  );
}

/**
 * flaggedEmails counts the attempt_flagged emails the API's sink holds for
 * the Admin that link to `attemptId`.
 */
async function flaggedEmails(attemptId: string): Promise<number> {
  const dir = emailSinkDir();
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) =>
    name.endsWith(".json"),
  );
  const sent = await Promise.all(
    names.map(
      async (name) =>
        JSON.parse(await readFile(path.join(dir, name), "utf8")) as {
          to: string;
          text: string;
          tags?: Record<string, string>;
        },
    ),
  );
  return sent.filter(
    (message) =>
      message.to === ADMIN.email &&
      message.tags?.["template"] === "attempt_flagged" &&
      message.text.includes(`/teacher/attempts/${attemptId}`),
  ).length;
}

/**
 * leaveTheTab is one absence past minAwayMs: the strike dialog says it is
 * recorded and the teacher told, with no count and nothing about a submit,
 * and is acknowledged. Then a change of answer carries the buffered events
 * to the server, and the spec waits until the server has counted `count`
 * absences, so each absence reaches it in a write of its own.
 */
async function leaveTheTab(
  page: Page,
  api: APIRequestContext,
  admin: Record<string, string>,
  attemptId: string,
  { count, answer }: { count: number; answer: string },
) {
  await goAway(page, AWAY_MS);
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Bạn vừa rời trang làm bài")).toBeVisible();
  await expect(dialog).toContainText(
    "Lần rời trang này đã được ghi lại, và giáo viên sẽ được báo.",
  );
  await expect(dialog).not.toContainText("lần được phép");
  await expect(dialog).not.toContainText("nộp");
  await dialog.getByRole("button", { name: "Quay lại bài làm" }).click();
  await expect(dialog).toBeHidden();

  await chooseOption(page, answer);
  await expect
    .poll(
      async () =>
        (await reviewAttempt(api, admin, attemptId)).attempt.integrity?.focusLossCount,
      { message: `the server counts absence ${count}`, timeout: 30_000 },
    )
    .toBe(count);
}

/** The fifteen-minute bucket of `ms` (since the epoch), as FlaggedAgainKey counts it. */
function bucketOf(ms: number): number {
  return Math.floor(ms / FLAGGED_BUCKET_MS);
}

/**
 * outsideBucketEdge waits for the next fifteen-minute bucket when fewer than
 * `marginMs` are left of this one, so that the absences after it usually
 * fall in one bucket and the spec sees the third absence change the second
 * notice. It is a preference, not a guarantee: a slow runner can still carry
 * the third absence over an edge, which noticesAfterTheThird allows for.
 * The bucket is the server's clock, which here and in CI is this machine's.
 */
async function outsideBucketEdge(page: Page, marginMs = 45_000) {
  const left = FLAGGED_BUCKET_MS - (Date.now() % FLAGGED_BUCKET_MS);
  if (left < marginMs) await waitUntil(page, Date.now() + left + 1_000);
}

/**
 * noticesAfterTheThird waits for the notices of the third absence and answers
 * their counts. The server tells the teacher again at most once per bucket,
 * by its own clock when the write lands: a third absence in the second
 * notice's bucket changes that notice's count to 3 and adds none ([1, 3]); in
 * a later bucket it is a notice of its own ([1, 2, 3]). `secondAt` is when
 * the second notice was written and `before` when the third absence began, so
 * the outcome is [1, 3] if `before` is still in the second's bucket and the
 * write lands in it, and [1, 2, 3] otherwise. A third notice in the second's
 * bucket is the server telling the teacher twice in one bucket, and fails.
 */
async function noticesAfterTheThird(
  api: APIRequestContext,
  admin: Record<string, string>,
  attemptId: string,
  { secondAt, before }: { secondAt: number; before: number },
): Promise<number[]> {
  const same = bucketOf(secondAt);
  // Until the third absence's notice is written the counts read [1,2], which neither matches.
  const outcome = bucketOf(before) === same ? /^\[1,(2,)?3\]$/ : /^\[1,2,3\]$/;
  let counts: number[] = [];
  await expect
    .poll(
      async () => {
        counts = await noticeCounts(api, admin, attemptId);
        return JSON.stringify(counts);
      },
      { message: `the third absence's notices, ${String(outcome)}`, timeout: 30_000 },
    )
    .toMatch(outcome);
  if (counts.length === 3) {
    expect(
      bucketOf(Date.now()),
      "a third notice only once the third absence is in a later bucket than the second",
    ).toBeGreaterThan(same);
  }
  return counts;
}

test("F1: a flexible paper takes a break, resumes on another device, leaves the tab without a submit, and the teacher is told once per bucket", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(240_000);
  const api = await playwright.request.newContext();
  const admin = await sharedApiAuth(api, ADMIN);
  const first = await browser.newContext();
  const second = await browser.newContext();
  const staff = await browser.newContext();

  try {
    // ------------------------------------------------------------ start
    const one = await first.newPage();
    await signInAsStudent(one);
    await one.goto(`/assignments/${ASSIGNMENT.flexible}`);
    // The intro under flexible: no time limit, and the paper can be left and
    // carried on until the close.
    await expect(one.getByText("Không tính giờ").first()).toBeVisible();
    await expect(
      one.getByText(/Bạn có thể dừng giữa chừng rồi quay lại làm tiếp/),
    ).toBeVisible();
    const attemptId = await freshAttempt(one, ASSIGNMENT.flexible);

    const started = await reviewAttempt(api, admin, attemptId);
    expect(started.attempt.status).toBe("in_progress");
    // The deadline is the close, thirty days out, not the stored one minute.
    expect(
      new Date(started.attempt.deadlineAt).getTime() -
        new Date(started.attempt.startedAt).getTime(),
    ).toBeGreaterThan(24 * 60 * 60_000);
    // The header shows when the paper closes, not a countdown.
    await expect(one.getByRole("img", { name: /^Bài đóng lúc / })).toBeVisible();
    await expect(one.getByRole("timer")).toHaveCount(0);

    // ------------------------------------------------------------ answer
    await chooseOption(one, "went");
    await expect(one.getByText(/^Đã lưu /)).toBeVisible({ timeout: 30_000 });

    // ------------------------------------------------------------ break
    await takeBreak(one);
    // The break reaches the server by the beacon the engine sends as it
    // unmounts; the resume waits for it, as a student back from a break does.
    const events = () => attemptEvents(api, admin, attemptId);
    await expect
      .poll(async () => (await events()).map((event) => event.kind), {
        message: "paper_left on the server",
        timeout: 30_000,
      })
      .toContain("paper_left");
    expect((await reviewAttempt(api, admin, attemptId)).attempt.status).toBe(
      "in_progress",
    );

    // ------------------------------------------------------------ resume elsewhere
    const two = await second.newPage();
    await signInAsStudent(two);
    expect(await startAttempt(two, ASSIGNMENT.flexible)).toBe(attemptId);
    // The answer given before the break is on the other device's paper.
    await expect(two.getByRole("radio", { name: "went" })).toBeChecked();

    // ------------------------------------------------------------ leave the tab
    // Three absences, each in a write of its own. Under strict, seed/12's rule
    // would submit the paper at the second; under flexible the first flags it
    // and tells the teacher, the second tells the teacher again under the
    // bucket's key, and the third, in the same bucket, changes that notice's
    // count and adds none.
    await leaveTheTab(two, api, admin, attemptId, { count: 1, answer: "gone" });
    await expect
      .poll(() => noticeCounts(api, admin, attemptId), { timeout: 30_000 })
      .toEqual([1]);
    await expect(two.getByText("Giáo viên đã được báo")).toBeVisible();

    await outsideBucketEdge(two);
    await leaveTheTab(two, api, admin, attemptId, { count: 2, answer: "went" });
    await expect
      .poll(() => noticeCounts(api, admin, attemptId), { timeout: 30_000 })
      .toEqual([1, 2]);
    const secondAt = Date.parse(
      (await flaggedNotices(api, admin, attemptId))[1]!.createdAt,
    );

    const before = Date.now();
    await leaveTheTab(two, api, admin, attemptId, { count: 3, answer: "gone" });
    // Usually [1, 3]; [1, 2, 3] when the third absence crossed into the next bucket.
    const notices = await noticesAfterTheThird(api, admin, attemptId, {
      secondAt,
      before,
    });
    // Email, the Admin's default for a flag, is sent once per notice key:
    // the flag and each bucket, two for the three absences in one bucket.
    await expect
      .poll(() => flaggedEmails(attemptId), { timeout: 30_000 })
      .toBe(notices.length);

    // No submit and no lock: the paper is still in progress on the server,
    // the engine still saves, and nothing on it says it was handed in.
    const absent = await reviewAttempt(api, admin, attemptId);
    expect(absent.attempt.status).toBe("in_progress");
    expect(absent.attempt.integrity).toEqual({ focusLossCount: 3, flagged: true });
    await expect(two.getByText("Bài làm đang được nộp")).toHaveCount(0);
    await expect(two.getByText("Bài làm này đã kết thúc.")).toHaveCount(0);
    await expect(
      two.getByRole("banner").getByRole("button", { name: "Tạm nghỉ", exact: true }),
    ).toBeVisible();

    // ------------------------------------------------------------ hand in
    await two.getByRole("button", { name: "Câu sau" }).click();
    await two
      .getByRole("textbox", { name: "Bài làm của bạn" })
      .fill("I have finished the paper after a break.");
    await expect(two.getByText(/^Đã lưu /)).toBeVisible({ timeout: 30_000 });
    await submitAttempt(two);

    const handedIn = await reviewAttempt(api, admin, attemptId);
    expect(handedIn.attempt.status).toBe("submitted");
    // The hand-in adds no notice of its absences.
    expect(await noticeCounts(api, admin, attemptId)).toEqual(notices);

    // ------------------------------------------------------------ the two times
    // Time on the paper is measured, and the break is not in it: it is at
    // most the span from start to hand-in less the break, give or take the
    // two clocks' rounding.
    const recorded = await events();
    const leftAt = recorded.findIndex((event) => event.kind === "paper_left");
    const resumed = recorded
      .slice(leftAt + 1)
      .find((event) => event.kind === "resume" || event.kind === "session_takeover");
    expect(resumed, "a resume after the break").toBeDefined();
    const breakMs =
      new Date(resumed!.occurredAt).getTime() -
      new Date(recorded[leftAt]!.occurredAt).getTime();
    expect(breakMs).toBeGreaterThan(0);
    const spanMs =
      new Date(handedIn.attempt.submittedAt!).getTime() -
      new Date(handedIn.attempt.startedAt).getTime();
    expect(handedIn.activeSeconds).toEqual(expect.any(Number));
    const activeSeconds = handedIn.activeSeconds!;
    expect(activeSeconds).toBeGreaterThan(0);
    expect(activeSeconds * 1000).toBeLessThanOrEqual(spanMs - breakMs + 2_000);

    // ------------------------------------------------------------ the teacher
    const teacher = await staff.newPage();
    await signInAsAdmin(teacher);
    await teacher.goto(
      `/teacher/assignments/${ASSIGNMENT.flexible}?attempt=${attemptId}`,
    );
    const sheet = teacher.getByRole("dialog", { name: STUDENT_NAME });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    // The flag.
    await expect(sheet.getByText("Cần xem lại", { exact: true })).toBeVisible();
    // Time on the paper, as the sheet words the server's activeSeconds.
    const minutes = Math.round(activeSeconds / 60);
    const fact = sheet.locator("dl > div").filter({ hasText: "Thời gian trên bài" });
    await expect(fact).toContainText(minutes < 1 ? "dưới 1 phút" : `${minutes} phút`);
    // The break on the timeline, as long as the server's events say.
    const timeline = sheet.getByRole("list").filter({ hasText: "Tạm nghỉ" });
    await expect(
      timeline
        .getByRole("listitem")
        .filter({ hasText: `Tạm nghỉ · ${spokenSpan(breakMs)}` }),
    ).toHaveCount(1);
    await expect(
      timeline
        .getByRole("listitem")
        .filter({ hasText: /^Vào lại bài/ })
        .first(),
    ).toBeVisible();
    // Still one email per notice, long after the third absence was announced.
    expect(await flaggedEmails(attemptId)).toBe(notices.length);
  } finally {
    await first.close();
    await second.close();
    await staff.close();
    await api.dispose();
  }
});

test("F1: a break returned to in the same tab ends at paper_returned with no resume, and a paper left on a break again reaches its close and reads timed out", async ({
  page,
  playwright,
}) => {
  test.setTimeout(180_000);
  const api = await playwright.request.newContext();
  try {
    const admin = await sharedApiAuth(api, ADMIN);
    // Signed in first, so that the window holds only the paper.
    await signInAsStudent(page);
    // Its own assignment per run, closing shortly: the close is the deadline,
    // so this is the wait. CLOSE_WINDOW_MS holds the start, the saves and the
    // events' arrival each taking as long as SAVE_TIMEOUT_MS allows, and the
    // two breaks. The window begins
    // before the start, so the stored time limit of one minute would end
    // after the close, and it is not applied either way.
    const closesAt = new Date(Date.now() + CLOSE_WINDOW_MS);
    const assignmentId = await createFlexibleAssignment(api, admin, { closesAt });
    const attemptId = await startAttempt(page, assignmentId);
    const started = await reviewAttempt(api, admin, attemptId);
    expect(started.attempt.status).toBe("in_progress");
    // The deadline is the student's close.
    expect(
      Math.abs(new Date(started.attempt.deadlineAt).getTime() - closesAt.getTime()),
    ).toBeLessThan(1_000);

    await chooseOption(page, "went");
    await expect(
      page.getByText(/^Đã lưu /),
      "the answer saved before the break",
    ).toBeVisible({
      timeout: SAVE_TIMEOUT_MS,
    });
    await takeBreak(page);
    const kinds = async () =>
      (await attemptEvents(api, admin, attemptId)).map((event) => event.kind);
    await expect
      .poll(kinds, { message: "paper_left on the server", timeout: SAVE_TIMEOUT_MS })
      .toContain("paper_left");
    await waitUntil(page, Date.now() + SAME_TAB_BREAK_MS);

    // Back in the same tab by the intro's "Tiếp tục làm bài": the tab still
    // holds its session, so the server resumes nothing, and the engine says
    // the paper is open again with the next save. The teacher's sheet reads
    // this break in flexible-long-break.live.spec.ts, which signs the Admin
    // in already; the timeline's units read it too.
    expect(await startAttempt(page, assignmentId)).toBe(attemptId);
    await expect(page.getByRole("radio", { name: "went" })).toBeChecked();
    await chooseOption(page, "gone");
    await expect
      .poll(kinds, {
        message: "paper_returned on the server",
        timeout: SAVE_TIMEOUT_MS,
      })
      .toContain("paper_returned");
    expect(
      sameTabBreakMs(await attemptEvents(api, admin, attemptId)),
    ).toBeGreaterThanOrEqual(SAME_TAB_BREAK_MS);

    // Left on a break again, this time until the close.
    await takeBreak(page);
    expect(Date.now(), "the last break began before the close").toBeLessThan(
      closesAt.getTime(),
    );

    // Nobody opens the paper until the close has passed. No job sweeps it:
    // the next read closes it.
    await waitUntil(page, closesAt.getTime() + 1_500);
    await page.goto(`/attempts/${attemptId}`);
    await expect(page.getByText("Bài làm này đã kết thúc.")).toBeVisible({
      timeout: 30_000,
    });

    const ended = await reviewAttempt(api, admin, attemptId);
    expect(ended.attempt.status).toBe("timed_out");
    expect(ended.attempt.submittedAt).toBe(ended.attempt.deadlineAt);
    // The answer saved before the break is kept with the paper.
    expect(Object.values(ended.answers).some((entry) => entry.answer !== null)).toBe(
      true,
    );
    // The close's read resumes nothing either.
    expect(
      sameTabBreakMs(await attemptEvents(api, admin, attemptId)),
    ).toBeGreaterThanOrEqual(SAME_TAB_BREAK_MS);
  } finally {
    await api.dispose();
  }
});
