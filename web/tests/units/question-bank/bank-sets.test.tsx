import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import QuestionBankPage from "@/features/question-bank/pages/teacher/QuestionBankPage";
import { contractJson } from "@tests/support/contractResponse";
import { bankPage, bankQuestion } from "@tests/support/questionBank";
import { server } from "@tests/support/server";
import { teacherUser } from "@tests/support/fixtures";
import { useAuthStore } from "@/stores/auth";
import { viewport } from "@tests/support/viewport";
import { serveSharing } from "../sharing/support";
import {
  BASE,
  Q1,
  Q2,
  renderAt,
  serveSets,
  sets,
  signIn,
  signOut,
  summary,
} from "./sets-support";

const ROUTES = [
  { path: "/teacher/question-bank", element: <QuestionBankPage /> },
  { path: "/teacher/question-bank/sets/:id", element: <p>set page</p> },
  { path: "/teacher/question-bank/:id", element: <p>editor page</p> },
];

beforeEach(() => {
  signIn();
  serveSets();
  serveSharing();
  server.use(
    http.get(`${BASE}/teacher/questions`, () =>
      contractJson(
        "/teacher/questions",
        "get",
        200,
        bankPage([
          bankQuestion({ id: Q1, prompt: "Câu một" }),
          bankQuestion({ id: Q2, prompt: "Câu hai" }),
        ]),
      ),
    ),
  );
});

afterEach(() => {
  signOut();
  vi.unstubAllGlobals();
});

/** refusal is the contract's error body for a refused set write. */
function refusal(code: string, message: string) {
  return {
    error: { code, message, requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e" },
  };
}

function renderBank() {
  return renderAt("/teacher/question-bank", ROUTES);
}

async function selectBoth(user: ReturnType<typeof renderBank>["user"]) {
  await user.click(
    await screen.findByRole("checkbox", { name: "Chọn Câu một" }, { timeout: 5000 }),
  );
  await user.click(screen.getByRole("checkbox", { name: "Chọn Câu hai" }));
}

describe("the bank's Sets group", () => {
  it("lists the teacher's sets first in the aside, with counts, a shared mark and links", async () => {
    sets.list = [
      summary(1, "Present perfect · A2", 24, 2),
      summary(2, "Prepositions after verbs", 36),
    ];
    const { user, router } = renderBank();

    const aside = await screen.findByRole("complementary", { name: "Bộ lọc" });
    const group = await within(aside).findByRole("region", { name: "Bộ câu hỏi" });
    const headings = within(aside).getAllByText(/^(Bộ câu hỏi|Loại câu)$/);
    expect(headings.map((node) => node.textContent)).toEqual([
      "Bộ câu hỏi",
      "Loại câu",
    ]);

    const first = within(group).getByRole("link", { name: /Present perfect · A2/ });
    expect(first).toHaveAttribute(
      "href",
      "/teacher/question-bank/sets/018f0000-0000-7000-8000-000000000501",
    );
    expect(first).toHaveTextContent("24");
    expect(
      within(first).getByRole("img", { name: "Đang chia sẻ với 2 giáo viên" }),
    ).toBeInTheDocument();
    const second = within(group).getByRole("link", {
      name: /Prepositions after verbs/,
    });
    expect(within(second).queryByRole("img")).toBeNull();
    // The deck's tip: who a shared set is shared with, else the name a narrow row cuts.
    expect(first).toHaveAttribute("title", "Đang chia sẻ với 2 giáo viên");
    expect(second).toHaveAttribute("title", "Prepositions after verbs");

    await user.click(first);
    expect(router.state.location.pathname).toBe(
      "/teacher/question-bank/sets/018f0000-0000-7000-8000-000000000501",
    );
    expect(router.state.location.state).toEqual({ from: "bank" });
  });

  it("shows five sets, then all of them in place", async () => {
    sets.list = Array.from({ length: 7 }, (_, n) => summary(n, `Bộ ${n + 1}`, n + 1));
    const { user } = renderBank();

    const group = await screen.findByRole("region", { name: "Bộ câu hỏi" });
    await waitFor(() => expect(within(group).getAllByRole("link")).toHaveLength(5));
    await user.click(within(group).getByRole("button", { name: "Xem tất cả 7 bộ" }));
    expect(within(group).getAllByRole("link")).toHaveLength(7);
    expect(within(group).queryByRole("button")).toBeNull();
  });

  it("says how to make the first set when there is none", async () => {
    renderBank();
    const group = await screen.findByRole("region", { name: "Bộ câu hỏi" });
    expect(
      await within(group).findByText(
        "Chưa có bộ nào. Chọn câu hỏi rồi bấm “Thêm vào bộ” để tạo bộ đầu tiên.",
      ),
    ).toBeInTheDocument();
  });

  it("draws three bars while the sets load", async () => {
    server.use(http.get(`${BASE}/teacher/question-sets`, () => new Promise(() => {})));
    renderBank();
    const group = await screen.findByRole("region", { name: "Bộ câu hỏi" });
    expect(group.querySelectorAll("[data-slot=skeleton]")).toHaveLength(3);
    expect(within(group).queryByRole("link")).toBeNull();
  });

  it("says when the sets could not be read, and Retry reads them again", async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/teacher/question-sets`, () =>
        fail
          ? new HttpResponse(null, { status: 500 })
          : contractJson("/teacher/question-sets", "get", 200, {
              items: [summary(1, "Present perfect · A2", 24)],
            }),
      ),
    );
    const { user } = renderBank();
    const group = await screen.findByRole("region", { name: "Bộ câu hỏi" });
    expect(
      await within(group).findByText("Không tải được các bộ của bạn."),
    ).toBeInTheDocument();

    fail = false;
    await user.click(within(group).getByRole("button", { name: "Thử lại" }));
    expect(
      await within(group).findByRole("link", { name: /Present perfect · A2/ }),
    ).toBeInTheDocument();
    expect(within(group).queryByText("Không tải được các bộ của bạn.")).toBeNull();
  });

  it("opens the Filters sheet below 1024px with the Sets group first", async () => {
    viewport(900);
    sets.list = [summary(1, "Present perfect · A2", 24)];
    const { user } = renderBank();
    await screen.findByRole("checkbox", { name: "Chọn Câu một" }, { timeout: 5000 });
    expect(screen.queryByRole("complementary", { name: "Bộ lọc" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Bộ lọc" }));
    const sheet = await screen.findByRole("dialog", { name: "Bộ lọc" });
    const group = within(sheet).getByRole("region", { name: "Bộ câu hỏi" });
    expect(
      within(group).getByRole("link", { name: /Present perfect · A2/ }),
    ).toHaveAttribute(
      "href",
      "/teacher/question-bank/sets/018f0000-0000-7000-8000-000000000501",
    );
    const headings = within(sheet).getAllByText(/^(Bộ câu hỏi|Loại câu)$/);
    expect(headings.map((node) => node.textContent)).toEqual([
      "Bộ câu hỏi",
      "Loại câu",
    ]);
  });

  it("reads the sets again after a bulk delete, whose questions they count", async () => {
    let reads = 0;
    sets.list = [summary(1, "Present perfect · A2", 24)];
    server.use(
      http.get(`${BASE}/teacher/question-sets`, () => {
        reads += 1;
        return contractJson("/teacher/question-sets", "get", 200, {
          items: [summary(1, "Present perfect · A2", reads === 1 ? 24 : 22)],
        });
      }),
      http.delete(
        `${BASE}/teacher/questions/:id`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { user } = renderBank();
    const group = await screen.findByRole("region", { name: "Bộ câu hỏi" });
    const row = await within(group).findByRole("link", {
      name: /Present perfect · A2/,
    });
    expect(row).toHaveTextContent("24");

    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Xoá" }));
    const confirm = await screen.findByRole("dialog", { name: "Xoá" });
    await user.click(within(confirm).getByRole("button", { name: "Xác nhận 2 mục" }));

    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect(row).toHaveTextContent("22"));
  });
});

describe("the bulk bar's Add to set", () => {
  it("adds the selection to an existing set, skipping what it holds", async () => {
    sets.list = [summary(1, "Present perfect · A2", 24), summary(2, "Travel", 40)];
    const { user } = renderBank();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào bộ" }));

    const dialog = await screen.findByRole("dialog", { name: "Thêm 2 câu vào bộ" });
    expect(
      within(dialog).getByRole("button", { name: "Bộ đã có", pressed: true }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "Bộ câu hỏi" }),
    ).toHaveTextContent("Present perfect · A2 · 24 câu");
    expect(
      within(dialog).getByText("Câu đã có trong bộ sẽ được bỏ qua."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Thêm vào bộ" }));

    await waitFor(() => expect(sets.added).toHaveLength(1));
    expect(sets.added[0]).toEqual({
      id: "018f0000-0000-7000-8000-000000000501",
      body: { questionIds: [Q1, Q2] },
    });
    expect(
      await screen.findByText("Đã thêm 2 câu vào “Present perfect · A2”"),
    ).toBeVisible();
    await waitFor(() => expect(screen.queryByText(/Đã chọn/)).toBeNull());
  });

  it("names a new set with a description", async () => {
    sets.list = [summary(1, "Present perfect · A2", 24)];
    const { user } = renderBank();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào bộ" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Bộ mới" }));
    await user.type(within(dialog).getByLabelText("Tên bộ"), "  Phrasal verbs · B1 ");
    await user.type(within(dialog).getByLabelText(/Mô tả/), "Cho lớp B1");
    await user.click(within(dialog).getByRole("button", { name: "Tạo bộ" }));

    await waitFor(() => expect(sets.created).toHaveLength(1));
    expect(sets.created[0]).toEqual({
      name: "Phrasal verbs · B1",
      description: "Cho lớp B1",
      questionIds: [Q1, Q2],
    });
    expect(
      await screen.findByText("Đã tạo bộ “Phrasal verbs · B1” với 2 câu"),
    ).toBeVisible();
  });

  it("asks only for a name when the teacher has no set yet", async () => {
    const { user } = renderBank();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào bộ" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Bộ đã có" })).toBeNull();
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect(within(dialog).getByLabelText("Tên bộ")).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Tạo bộ" })).toBeInTheDocument();
  });

  it("says at once that a set would pass 500, and does not add", async () => {
    sets.list = [summary(5, "Grammar review · all levels", 499)];
    const { user } = renderBank();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào bộ" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Bộ này đang có 499 câu. Một bộ chứa tối đa 500 câu hỏi.",
      ),
    ).toBeVisible();
    expect(within(dialog).queryByText("Câu đã có trong bộ sẽ được bỏ qua.")).toBeNull();
    const submit = within(dialog).getByRole("button", { name: "Thêm vào bộ" });
    expect(submit).toHaveAttribute("aria-disabled", "true");
    await user.click(submit);
    expect(sets.added).toEqual([]);
  });
});

describe("the Add to set dialog's refusals", () => {
  it("shows a refused add's reason in the dialog and keeps it open", async () => {
    sets.list = [summary(1, "Present perfect · A2", 24)];
    server.use(
      http.post(`${BASE}/teacher/question-sets/:id/items`, () =>
        contractJson(
          "/teacher/question-sets/{id}/items",
          "post",
          404,
          refusal("NOT_FOUND", "Một câu hỏi đã chọn không còn trong ngân hàng."),
        ),
      ),
    );
    const { user } = renderBank();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào bộ" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm 2 câu vào bộ" });
    await user.click(within(dialog).getByRole("button", { name: "Thêm vào bộ" }));

    expect(
      await within(dialog).findByText("Một câu hỏi đã chọn không còn trong ngân hàng."),
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Thêm 2 câu vào bộ" })).toBeVisible();
    expect(screen.getByText(/Đã chọn/)).toBeInTheDocument();
  });

  it("shows a refused create's reason in the dialog and keeps it open", async () => {
    server.use(
      http.post(`${BASE}/teacher/question-sets`, () =>
        contractJson(
          "/teacher/question-sets",
          "post",
          404,
          refusal("NOT_FOUND", "Một câu hỏi đã chọn không còn trong ngân hàng."),
        ),
      ),
    );
    const { user } = renderBank();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào bộ" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Tên bộ"), "Phrasal verbs · B1");
    await user.click(within(dialog).getByRole("button", { name: "Tạo bộ" }));

    expect(
      await within(dialog).findByText("Một câu hỏi đã chọn không còn trong ngân hàng."),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Tên bộ")).toHaveValue("Phrasal verbs · B1");
    expect(screen.getByText(/Đã chọn/)).toBeInTheDocument();
  });
});

describe("the bulk bar's Share…", () => {
  it("names the set, creates it and opens the share dialog on it", async () => {
    sets.list = [summary(1, "Present perfect · A2", 24)];
    const { user } = renderBank();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Chia sẻ…" }));

    const dialog = await screen.findByRole("dialog", { name: "Chia sẻ 2 câu đã chọn" });
    expect(within(dialog).queryByRole("button", { name: "Bộ đã có" })).toBeNull();
    expect(within(dialog).queryByLabelText(/Mô tả/)).toBeNull();
    await user.type(within(dialog).getByLabelText("Tên bộ"), "Reported speech · B1");
    await user.click(within(dialog).getByRole("button", { name: "Tạo bộ và chia sẻ" }));

    await waitFor(() => expect(sets.created).toHaveLength(1));
    const share = await screen.findByRole("dialog", {
      name: "Chia sẻ “Reported speech · B1”",
    });
    expect(
      within(share).getByText("Chỉ bạn thấy cho đến khi bạn chia sẻ."),
    ).toBeInTheDocument();
    expect(
      within(share).getByText(
        "Mở bộ, thêm câu vào đề thi của họ và tạo bản sao riêng.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(sets.created).toHaveLength(1));
    expect(screen.queryByText(/Đã chọn/)).toBeNull();
  });

  it("is not offered without the share permission, and the header has no Share", async () => {
    useAuthStore.setState({
      user: {
        ...teacherUser,
        permissions: teacherUser.permissions.filter((key) => key !== "content.share"),
      },
    });
    const { user } = renderBank();
    await screen.findByRole("region", { name: "Bộ câu hỏi" });
    expect(screen.queryByRole("button", { name: /Chia sẻ/ })).toBeNull();

    await selectBoth(user);
    expect(screen.getByRole("button", { name: "Thêm vào bộ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chia sẻ…" })).toBeNull();
  });
});
