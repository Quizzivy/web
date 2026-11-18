import { expect, test } from "@playwright/test";
import {
  ADMIN,
  chooseOption,
  createFlexibleAssignment,
  reviewAttempt,
  sharedApiAuth,
  signInAsAdmin,
  signInAsStudent,
  startAttempt,
  submitAttempt,
  takeBreak,
  waitUntil,
} from "./support/live";

/**
 * F1 (docs/plan/77f, T-F1.9): a break past a minute. In the slow project,
 * because the wait is real: the teacher's two times differ only once they
 * round to different minutes, and the assignment stores a one-minute time
 * limit, which a flexible attempt running past it shows is not applied.
 * flexible.live.spec.ts walks everything else.
 */

/** The seeded student's name, as the teacher's sheet and roster write it (seed/01). */
const STUDENT_NAME = /Nguyễn Văn An/;

/** minutesLabel as the teacher's views word a whole number of minutes. */
const minutesLabel = (minutes: number) =>
  minutes < 1 ? "dưới 1 phút" : `${minutes} phút`;

test("F1: after a break past a minute the teacher reads time on the paper and the span, and the stored minute is not applied", async ({
  page,
  browser,
  playwright,
}) => {
  test.setTimeout(240_000);
  const api = await playwright.request.newContext();
  const staff = await browser.newContext();
  try {
    const admin = await sharedApiAuth(api, ADMIN);
    const assignmentId = await createFlexibleAssignment(api, admin, {
      closesAt: new Date(Date.now() + 2 * 60 * 60_000),
    });

    await signInAsStudent(page);
    const attemptId = await startAttempt(page, assignmentId);
    await chooseOption(page, "went");
    await expect(page.getByText(/^Đã lưu /)).toBeVisible({ timeout: 30_000 });
    await takeBreak(page);

    // The break runs until the attempt is more than a minute old: past the
    // stored time limit, and past a minute more than the paper was open.
    const { startedAt } = (await reviewAttempt(api, admin, attemptId)).attempt;
    await waitUntil(page, new Date(startedAt).getTime() + 65_000);
    expect((await reviewAttempt(api, admin, attemptId)).attempt.status).toBe(
      "in_progress",
    );

    expect(await startAttempt(page, assignmentId)).toBe(attemptId);
    await expect(page.getByRole("radio", { name: "went" })).toBeChecked();
    await submitAttempt(page);

    const handedIn = await reviewAttempt(api, admin, attemptId);
    expect(handedIn.attempt.status).toBe("submitted");
    expect(handedIn.activeSeconds).toEqual(expect.any(Number));
    const onPaper = Math.round(handedIn.activeSeconds! / 60);
    const span = Math.round(
      (new Date(handedIn.attempt.submittedAt!).getTime() -
        new Date(startedAt).getTime()) /
        60_000,
    );
    expect(span, "the span rounds past the time on the paper").toBeGreaterThan(onPaper);

    const teacher = await staff.newPage();
    await signInAsAdmin(teacher);

    // The roster: time on the paper over the span.
    await teacher.goto(`/teacher/assignments/${assignmentId}`);
    const row = teacher.getByRole("row").filter({ hasText: STUDENT_NAME });
    await expect(row).toContainText(minutesLabel(onPaper), { timeout: 30_000 });
    await expect(row).toContainText(`trong ${minutesLabel(span)}`);

    // The attempt's sheet: the same two.
    await teacher.goto(`/teacher/assignments/${assignmentId}?attempt=${attemptId}`);
    const sheet = teacher.getByRole("dialog", { name: STUDENT_NAME });
    const fact = sheet.locator("dl > div").filter({ hasText: "Thời gian trên bài" });
    await expect(fact).toContainText(minutesLabel(onPaper), { timeout: 30_000 });
    await expect(fact).toContainText(`trong ${minutesLabel(span)}`);
  } finally {
    await staff.close();
    await api.dispose();
  }
});
