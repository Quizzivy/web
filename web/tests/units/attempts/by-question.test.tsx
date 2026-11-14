import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http } from "msw";
import AttemptReviewPage from "@/features/attempts/pages/teacher/AttemptReviewPage";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import "@/lib/i18n";
import { ASSIGNMENT_ID, ATTEMPT_ID, BASE, ESSAY_ID, review } from "./fixtures";

const OTHER_ATTEMPT = "018f0000-0000-7000-8000-0000000000a8";
let grades: { attemptId: string; body: unknown }[] = [];

beforeEach(() => {
  grades = [];
  const paper = review();
  server.use(
    http.get(`${BASE}/teacher/attempts/${ATTEMPT_ID}`, () =>
      contractJson("/teacher/attempts/{id}", "get", 200, paper),
    ),
    http.get(`${BASE}/teacher/assignments/${ASSIGNMENT_ID}/answers`, ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("questionId")).toBe(ESSAY_ID);
      return contractJson("/teacher/assignments/{id}/answers", "get", 200, {
        question: paper.questions[1],
        questionNumber: 2,
        questionCount: 2,
        manualQuestionIds: [ESSAY_ID],
        items: [
          {
            attemptId: ATTEMPT_ID,
            studentId: paper.student.id,
            studentName: "Nguyễn Đức Minh",
            attemptNo: 1,
            answer: { type: "text", value: "I usually wake up at six." },
            manualScore: 4,
            graderComment: null,
          },
          {
            attemptId: OTHER_ATTEMPT,
            studentId: "018f0000-0000-7000-8000-0000000000e2",
            studentName: "Phạm Gia Hân",
            attemptNo: 1,
            answer: { type: "text", value: "I wake up 6 o'clock." },
            manualScore: null,
            graderComment: null,
          },
        ],
      });
    }),
    http.post(`${BASE}/teacher/attempts/:id/grade`, async ({ params, request }) => {
      grades.push({ attemptId: String(params["id"]), body: await request.json() });
      return contractJson("/teacher/attempts/{id}/grade", "post", 200, {
        earned: 8,
        total: 10,
        pendingManual: 0,
      });
    }),
  );
});

/**
 * renderReview renders the paper inside a focusable `main`, as the shell does:
 * a dialog whose opener is gone gives focus back to that element.
 */
function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/teacher/attempts/:id",
        element: (
          <main tabIndex={-1}>
            <AttemptReviewPage />
          </main>
        ),
      },
    ],
    { initialEntries: [`/teacher/attempts/${ATTEMPT_ID}`] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("G-04, grading one question across every paper", () => {
  it("hides names, pins the rubric, and grades a paper from its row", async () => {
    const user = renderReview();
    await user.click(await screen.findByRole("button", { name: "Chấm theo câu hỏi" }));

    expect(await screen.findByText("Học viên 01")).toBeInTheDocument();
    expect(screen.getByText("Học viên 02")).toBeInTheDocument();
    expect(screen.queryByText("Phạm Gia Hân")).toBeNull();
    expect(screen.getByText("Unit 5 · Câu 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Đã chấm 1/2")).toBeInTheDocument();
    expect(
      screen.getByText("I get up at half past six every morning."),
    ).toBeInTheDocument();

    const second = screen
      .getByText("Học viên 02")
      .closest<HTMLElement>("[data-slot='card']")!;
    const points = within(second).getByRole("spinbutton");
    await user.type(points, "3{Enter}");

    await waitFor(() => expect(grades).toHaveLength(1));
    expect(grades[0]).toEqual({
      attemptId: OTHER_ATTEMPT,
      body: { items: [{ questionId: ESSAY_ID, points: 3, comment: null }] },
    });
  });

  it("reveals names on request", async () => {
    const user = renderReview();
    await user.click(await screen.findByRole("button", { name: "Chấm theo câu hỏi" }));
    await screen.findByText("Học viên 01");

    await user.click(screen.getByRole("button", { name: "Hiện tên" }));

    expect(screen.getByText("Phạm Gia Hân")).toBeInTheDocument();
    expect(screen.queryByText("Học viên 02")).toBeNull();
  });
});

describe("G-04, moving to the next question (GF-7)", () => {
  const SECOND_ID = "018f0000-0000-7000-8000-00000000aa03";

  function answersOf(questionId: string) {
    const paper = review();
    const second = questionId === SECOND_ID;
    return {
      question: { ...paper.questions[1]!, id: questionId },
      questionNumber: second ? 3 : 2,
      questionCount: 3,
      manualQuestionIds: [ESSAY_ID, SECOND_ID],
      items: [
        {
          attemptId: ATTEMPT_ID,
          studentId: paper.student.id,
          studentName: "Nguyễn Đức Minh",
          attemptNo: 1,
          answer: { type: "text" as const, value: "I usually wake up at six." },
          manualScore: second ? 4 : null,
          graderComment: null,
        },
        {
          attemptId: OTHER_ATTEMPT,
          studentId: "018f0000-0000-7000-8000-0000000000e2",
          studentName: "Phạm Gia Hân",
          attemptNo: 1,
          answer: { type: "text" as const, value: "I wake up 6 o'clock." },
          manualScore: null,
          graderComment: null,
        },
      ],
    };
  }

  beforeEach(() => {
    server.use(
      http.get(`${BASE}/teacher/assignments/${ASSIGNMENT_ID}/answers`, ({ request }) =>
        contractJson(
          "/teacher/assignments/{id}/answers",
          "get",
          200,
          answersOf(new URL(request.url).searchParams.get("questionId") ?? ""),
        ),
      ),
    );
  });

  const box = (who: string) =>
    screen.getByRole("spinbutton", { name: `Điểm cho ${who}` });

  it("puts focus on the first answer still to mark when save-and-next leaves from a row", async () => {
    const user = renderReview();
    await user.click(await screen.findByRole("button", { name: "Chấm theo câu hỏi" }));
    await screen.findByText("Unit 5 · Câu 2 / 3");

    await user.type(box("Học viên 01"), "3{Control>}{Enter}{/Control}");

    await waitFor(() => expect(grades).toHaveLength(1));
    expect(await screen.findByText("Unit 5 · Câu 3 / 3")).toBeVisible();
    await waitFor(() => expect(box("Học viên 02")).toHaveFocus());
  });

  it("lands on the first answer too when another row's unsaved mark is asked about first", async () => {
    const user = renderReview();
    await user.click(await screen.findByRole("button", { name: "Chấm theo câu hỏi" }));
    await screen.findByText("Unit 5 · Câu 2 / 3");

    await user.type(box("Học viên 02"), "2");
    await user.type(box("Học viên 01"), "3{Control>}{Enter}{/Control}");
    const ask = await screen.findByRole("dialog", {
      name: "Rời trang khi điểm chưa lưu?",
    });
    await user.click(within(ask).getByRole("button", { name: "Rời đi" }));

    expect(await screen.findByText("Unit 5 · Câu 3 / 3")).toBeVisible();
    await waitFor(() => expect(box("Học viên 02")).toHaveFocus());
  });

  it("leaves focus on the heading's Next question when that is what was pressed", async () => {
    const user = renderReview();
    await user.click(await screen.findByRole("button", { name: "Chấm theo câu hỏi" }));
    await screen.findByText("Unit 5 · Câu 2 / 3");
    const next = screen.getByRole("button", { name: "Câu tiếp theo" });

    await user.click(next);

    expect(await screen.findByText("Unit 5 · Câu 3 / 3")).toBeVisible();
    await screen.findByRole("spinbutton", { name: "Điểm cho Học viên 02" });
    expect(next).toHaveFocus();
  });
});
