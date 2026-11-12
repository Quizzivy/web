import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http } from "msw";
import "@/lib/i18n";
import TestBuilderPage from "@/features/tests/pages/teacher/TestBuilderPage";
import { AddButtons } from "@/features/tests/components/AddButtons";
import type { components } from "@/lib/api/schema";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { viewport } from "@tests/support/viewport";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const BASE = "http://localhost:8080";
const TEST_ID = "018f0000-0000-7000-8000-0000000004a1";
const SECTION_ID = "018f0000-0000-7000-8000-0000000004c1";
const STAMP = "2026-01-01T00:00:00Z";

type CreateInput = components["schemas"]["GroupCreateInput"];
type Stored = components["schemas"]["StoredQuestionGroup"];

describe("the outline's two add buttons", () => {
  it("keeps Add question one press and lists the four starts with what each gives", async () => {
    viewport(1280);
    const onCreateQuestion = vi.fn();
    const onCreateGroup = vi.fn();
    render(
      <AddButtons
        disabled={false}
        target="Phần 2"
        onCreateQuestion={onCreateQuestion}
        onCreateGroup={onCreateGroup}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Thêm câu hỏi/ }));
    expect(onCreateQuestion).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Bài đọc, điền từ, bài nghe" }),
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Thêm vào Phần 2")).toBeVisible();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.querySelector("span > span")?.textContent),
    ).toEqual([
      "Bài đọc và câu hỏi",
      "Bài điền từ",
      "Bài nghe và câu hỏi",
      "Bài nghe điền từ",
    ]);
    expect(
      within(menu).getByText("Đoạn văn có chỗ trống. Bôi đen một từ để tạo chỗ trống."),
    ).toBeVisible();
    await user.click(within(menu).getByText("Bài nghe điền từ"));
    expect(onCreateGroup).toHaveBeenCalledWith("listeningCloze");
  });

  it("is one + with a sheet of five below 768px, the question first", async () => {
    viewport("phone");
    const onCreateQuestion = vi.fn();
    const onCreateGroup = vi.fn();
    render(
      <AddButtons
        disabled={false}
        target="Phần 2"
        onCreateQuestion={onCreateQuestion}
        onCreateGroup={onCreateGroup}
      />,
    );
    const user = userEvent.setup();
    expect(
      screen.queryByRole("button", { name: "Bài đọc, điền từ, bài nghe" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Thêm vào Phần 2" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm vào Phần 2" });
    expect(
      within(sheet)
        .getAllByRole("button")
        .map((button) => button.querySelector("span > span")?.textContent),
    ).toEqual([
      "Thêm câu hỏi",
      "Bài đọc và câu hỏi",
      "Bài điền từ",
      "Bài nghe và câu hỏi",
      "Bài nghe điền từ",
    ]);
    await user.click(within(sheet).getByText("Bài điền từ"));
    expect(onCreateGroup).toHaveBeenCalledWith("cloze");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Thêm vào Phần 2" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByText("Thêm câu hỏi"),
    );
    expect(onCreateQuestion).toHaveBeenCalledTimes(1);
  });
});

describe("starting a cloze from the outline", () => {
  let created: CreateInput[];

  beforeEach(() => {
    viewport(1280);
    created = [];
    const groups = new Map<string, Stored>();
    server.use(
      http.get(`${BASE}/teacher/tests/${TEST_ID}`, () =>
        contractJson("/teacher/tests/{id}", "get", 200, {
          skills: [],
          assignments: { live: 0, scheduled: 0, closed: 0 },
          unpublishedChanges: null,
          id: TEST_ID,
          title: "Unit 6",
          description: null,
          status: "draft",
          currentVersion: 0,
          nextVersion: 1,
          totalPoints: 0,
          questionCount: 0,
          audioCount: 0,
          sections: [
            {
              id: SECTION_ID,
              ordinal: 0,
              title: "Đọc hiểu",
              instructions: null,
              questionIds: [],
              units: [],
            },
          ],
          createdAt: STAMP,
          updatedAt: STAMP,
        } satisfies components["schemas"]["Test"]),
      ),
      http.post(`${BASE}/teacher/question-groups`, async ({ request }) => {
        const input = (await request.json()) as CreateInput;
        created.push(input);
        const stored: Stored = {
          bundle: input.bundle as Stored["bundle"],
          ownerSectionId: input.ownerSectionId ?? null,
          revision: 1,
          testUpdatedAt: STAMP,
          archivedAt: null,
          createdAt: STAMP,
          updatedAt: STAMP,
          assets: [],
          unavailableAssetIds: [],
        };
        groups.set(input.bundle.group.id, stored);
        return contractJson("/teacher/question-groups", "post", 201, stored);
      }),
      http.get(`${BASE}/teacher/question-groups/:id`, ({ params }) =>
        contractJson(
          "/teacher/question-groups/{id}",
          "get",
          200,
          groups.get(String(params["id"]))!,
        ),
      ),
    );
  });

  it("makes the group with its first text in place and puts the cursor in its title", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: "/teacher/tests/:id/edit", element: <TestBuilderPage /> }],
      { initialEntries: [`/teacher/tests/${TEST_ID}/edit`] },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Bài đọc, điền từ, bài nghe" },
        { timeout: 5000 },
      ),
    );
    await user.click(await screen.findByText("Bài điền từ"));

    const title = await screen.findByRole("textbox", { name: "Tiêu đề" });
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveValue("Bài điền từ mới");
    expect([
      (title as HTMLInputElement).selectionStart,
      (title as HTMLInputElement).selectionEnd,
    ]).toEqual([0, "Bài điền từ mới".length]);

    expect(created).toHaveLength(1);
    expect(created[0]!.ownerSectionId).toBe(SECTION_ID);
    expect(created[0]!.bundle.group.title).toBe("Bài điền từ mới");
    expect(created[0]!.bundle.group.stimuli).toHaveLength(1);
    expect(created[0]!.bundle.group.stimuli[0]!.title).toBe("Bài điền từ mới");
    expect(created[0]!.bundle.questions).toEqual([]);

    expect(screen.getByText("Bài điền từ · Đọc hiểu")).toBeVisible();
    expect(screen.getByText("Bài điền từ trong ba bước")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Chỗ trống" })).toBeVisible();
    expect(await screen.findByRole("img", { name: "Bài điền từ" })).toBeInTheDocument();
  });
});
