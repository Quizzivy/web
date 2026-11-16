import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import { dashboardKeys } from "@/features/dashboard/keys";
import SharedWithMePage from "@/features/sharing/pages/teacher/SharedWithMePage";
import { Toaster, toast } from "@/components/ui/sonner";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import { testFixture } from "@tests/units/tests/detailHarness";
import { BASE } from "./support";

type Item = components["schemas"]["SharedWithMeItem"];

function owner(n: number, name: string, disabled = false) {
  return {
    id: `018f0000-0000-7000-8000-00000000010${n}`,
    name,
    avatarUrl: null,
    disabled,
  };
}

const DUC = owner(1, "Phan Minh Đức");
const VAN = owner(5, "Lý Thanh Vân", true);
const THIS_YEAR = new Date().getUTCFullYear();

function item(
  n: number,
  kind: Item["kind"],
  name: string,
  by: Item["owner"],
  access: Item["access"],
  questionCount: number | null = null,
): Item {
  return {
    shareId: `018f0000-0000-7000-8000-00000000030${n}`,
    kind,
    resourceId: `018f0000-0000-7000-8000-00000000040${n}`,
    name,
    owner: by,
    access,
    sharedAt: `${THIS_YEAR}-09-2${n}T03:00:00Z`,
    questionCount,
  };
}

const MOCK = item(1, "test", "IELTS Writing Task 2 · Mock set", DUC, "edit");
const COLLOCATIONS = item(2, "question_set", "Collocations", DUC, "use", 48);
const PHRASAL = item(4, "question_set", "Phrasal verbs · B1", VAN, "use", 32);

/** The server's side: what is shared, what was asked, and how it answers. */
const state = {
  items: [] as Item[],
  reads: [] as URLSearchParams[],
  listStatus: 200,
  listHang: false,
  copied: [] as string[],
  removed: [] as string[],
  actionStatus: 200,
};

function counts(items: readonly Item[]) {
  return {
    all: items.length,
    test: items.filter((x) => x.kind === "test").length,
    questionSet: items.filter((x) => x.kind === "question_set").length,
  };
}

const NOT_FOUND = {
  error: {
    code: "NOT_FOUND",
    message: "Not found.",
    requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
  },
};

function serve() {
  state.items = [MOCK, COLLOCATIONS, PHRASAL];
  state.reads = [];
  state.listStatus = 200;
  state.listHang = false;
  state.copied = [];
  state.removed = [];
  state.actionStatus = 200;
  server.use(
    http.get(`${BASE}/teacher/shared-with-me`, async ({ request }) => {
      const query = new URL(request.url).searchParams;
      state.reads.push(query);
      if (state.listHang) await new Promise(() => {});
      if (state.listStatus !== 200) return new HttpResponse(null, { status: 500 });
      const q = (query.get("q") ?? "").toLowerCase();
      const found = state.items.filter((x) =>
        `${x.name} ${x.owner.name}`.toLowerCase().includes(q),
      );
      const kind = query.get("kind");
      const items = found.filter((x) => kind === null || x.kind === kind);
      return contractJson("/teacher/shared-with-me", "get", 200, {
        page: Number(query.get("page") ?? 1),
        pageSize: Number(query.get("limit") ?? 20),
        total: items.length,
        items,
        counts: counts(found),
      });
    }),
    http.post(`${BASE}/teacher/tests/:id/copy`, ({ params }) => {
      state.copied.push(`test:${String(params["id"])}`);
      if (state.actionStatus === 404)
        return contractJson("/teacher/tests/{id}/copy", "post", 404, NOT_FOUND);
      return contractJson(
        "/teacher/tests/{id}/copy",
        "post",
        201,
        testFixture({ id: "018f0000-0000-7000-8000-000000000601", title: MOCK.name }),
      );
    }),
    http.post(`${BASE}/teacher/question-sets/:id/copy`, ({ params }) => {
      state.copied.push(`set:${String(params["id"])}`);
      return contractJson("/teacher/question-sets/{id}/copy", "post", 201, {
        setId: "018f0000-0000-7000-8000-000000000501",
        questionIds: [],
      });
    }),
    http.delete(`${BASE}/teacher/shared-with-me/:id`, ({ params }) => {
      const id = String(params["id"]);
      state.removed.push(id);
      if (state.actionStatus === 404)
        return contractJson(
          "/teacher/shared-with-me/{shareId}",
          "delete",
          404,
          NOT_FOUND,
        );
      state.items = state.items.filter((x) => x.shareId !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

function signIn(permissions = teacherUser.permissions) {
  useAuthStore.setState({
    user: { ...teacherUser, permissions },
    accessToken: "token",
  });
}

function renderPage(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/teacher/shared-with-me", element: <SharedWithMePage /> },
      { path: "*", element: <p>elsewhere</p> },
    ],
    { initialEntries: [`/teacher/shared-with-me${search}`] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router, client };
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
const lastRead = () => state.reads.at(-1)!;
const tab = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  serve();
  signIn();
});

afterEach(() => {
  toast.dismiss();
  useAuthStore.setState({ user: null, accessToken: null });
});

describe("Shared with me", () => {
  it("draws the deck's header, callout, tabs with counts and rows, naming only tests and questions", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Được chia sẻ với tôi" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Đề thi và câu hỏi mà giáo viên khác chia sẻ với bạn. Chúng vẫn thuộc về giáo viên đã chia sẻ.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/danh sách từ|khoá học/i)).toBeNull();
    expect(
      screen.getByText("cho phép bạn mở, giao cho lớp của mình và tạo bản sao riêng.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(screen.getByPlaceholderText("Tìm theo tên hoặc giáo viên")).toBeVisible();

    await screen.findByRole("row", { name: /IELTS Writing/ });
    const tabs = within(screen.getByRole("group", { name: "Loại nội dung" }));
    expect(tabs.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Tất cả 3",
      "Đề thi 1",
      "Câu hỏi 2",
    ]);
    expect(tabs.getByRole("button", { name: /^Tất cả/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const mock = within(row("IELTS Writing"));
    expect(mock.getByText("Đề thi")).toBeVisible();
    expect(mock.getByText("Phan Minh Đức")).toBeVisible();
    expect(mock.getByText("Có thể sửa")).toBeVisible();
    expect(mock.getByText("21/09")).toBeVisible();
    expect(mock.queryByText("Tài khoản đã vô hiệu hoá")).toBeNull();

    const set = within(row("Collocations"));
    expect(set.getByText("Bộ câu hỏi · 48 câu")).toBeVisible();
    expect(set.getByText("Có thể dùng")).toBeVisible();

    expect(
      within(row("Phrasal verbs")).getByText("Tài khoản đã vô hiệu hoá"),
    ).toBeVisible();
  });

  it("keeps the table at 820px, so it scrolls inside its card and never the page", async () => {
    renderPage();
    await screen.findByRole("row", { name: /IELTS Writing/ });

    const header = screen.getAllByRole("row")[0]!;
    const template = header.style.gridTemplateColumns;
    expect(template).toBe("minmax(184px,2fr) minmax(140px,1.2fr) 112px 92px 212px");
    const minimums = [184, 140, 112, 92, 212];
    const gaps = 12 * 4;
    const padding = 16 * 2;
    expect(minimums.reduce((a, b) => a + b, 0) + gaps + padding).toBe(820);
    expect(header.closest('[data-slot="data-table"]')).toHaveClass("overflow-x-auto");
  });

  it("opens a test in its builder and a set on its page, from the name and from Open", async () => {
    renderPage();
    await screen.findByRole("row", { name: /IELTS Writing/ });

    const mock = within(row("IELTS Writing"));
    const builder = `/teacher/tests/${MOCK.resourceId}/edit`;
    expect(mock.getByRole("link", { name: /IELTS Writing/ })).toHaveAttribute(
      "href",
      builder,
    );
    expect(mock.getByRole("link", { name: "Mở" })).toHaveAttribute("href", builder);

    const set = within(row("Collocations"));
    const page = `/teacher/question-bank/sets/${COLLOCATIONS.resourceId}`;
    expect(set.getByRole("link", { name: /Collocations/ })).toHaveAttribute(
      "href",
      page,
    );
    expect(set.getByRole("link", { name: "Mở" })).toHaveAttribute("href", page);
  });

  it("puts the tab, the search and the page in the URL, and reads them from it", async () => {
    const { user, router } = renderPage("?kind=question_set&q=coll&page=2");

    await waitFor(() => expect(state.reads.length).toBeGreaterThan(0));
    expect(lastRead().get("kind")).toBe("question_set");
    expect(lastRead().get("q")).toBe("coll");
    expect(lastRead().get("page")).toBe("2");
    expect(tab("Câu hỏi")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("Tìm theo tên hoặc giáo viên")).toHaveValue(
      "coll",
    );

    await user.click(tab("Đề thi"));
    await waitFor(() => expect(lastRead().get("kind")).toBe("test"));
    expect(new URLSearchParams(router.state.location.search).get("kind")).toBe("test");
    expect(lastRead().get("page")).toBe("1");

    await user.click(tab("Tất cả"));
    await waitFor(() => expect(lastRead().get("kind")).toBeNull());
    expect(router.state.location.search).not.toContain("kind=");

    const search = screen.getByPlaceholderText("Tìm theo tên hoặc giáo viên");
    await user.clear(search);
    await user.type(search, "Đức");
    await waitFor(() => expect(lastRead().get("q")).toBe("Đức"));
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe("Đức");
  });

  it("makes a copy of a set after its confirm, toasts where it went and leaves the list as it is", async () => {
    const { user } = renderPage();
    await screen.findByRole("row", { name: /Collocations/ });
    const reads = state.reads.length;

    await user.click(
      within(row("Collocations")).getByRole("button", { name: "Tạo bản sao" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Tạo bản sao của “Collocations”?",
    });
    expect(
      within(dialog).getByText(
        "Bản sao là của bạn: chỉ bạn thấy, và bạn sửa tuỳ ý. Bản gốc của Phan Minh Đức không thay đổi.",
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Tạo bản sao" }));

    expect(
      await screen.findByText("Đã sao chép vào Ngân hàng câu hỏi của bạn"),
    ).toBeVisible();
    expect(state.copied).toEqual([`set:${COLLOCATIONS.resourceId}`]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(state.reads).toHaveLength(reads);
    expect(row("Collocations")).toBeVisible();
  });

  it("toasts “Copied to your Tests” for a test", async () => {
    const { user } = renderPage();
    await screen.findByRole("row", { name: /IELTS Writing/ });

    await user.click(
      within(row("IELTS Writing")).getByRole("button", { name: "Tạo bản sao" }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Tạo bản sao",
      }),
    );

    expect(await screen.findByText("Đã sao chép vào Đề thi của bạn")).toBeVisible();
    expect(state.copied).toEqual([`test:${MOCK.resourceId}`]);
  });

  it("offers Make a copy only for the kinds the teacher may write", async () => {
    signIn(teacherUser.permissions.filter((key) => key !== "content.tests.write"));
    renderPage();
    await screen.findByRole("row", { name: /IELTS Writing/ });

    expect(
      within(row("IELTS Writing")).queryByRole("button", { name: "Tạo bản sao" }),
    ).toBeNull();
    expect(
      within(row("Collocations")).getByRole("button", { name: "Tạo bản sao" }),
    ).toBeVisible();
    expect(
      within(row("IELTS Writing")).getByRole("button", {
        name: "Gỡ khỏi danh sách của tôi",
      }),
    ).toBeVisible();
  });

  it("removes an item after a danger confirm in the deck's words, and the row and its count leave", async () => {
    const { user } = renderPage();
    await screen.findByRole("row", { name: /IELTS Writing/ });

    await user.click(
      within(row("IELTS Writing")).getByRole("button", {
        name: "Gỡ khỏi danh sách của tôi",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Gỡ “IELTS Writing Task 2 · Mock set” khỏi danh sách của bạn?",
    });
    expect(
      within(dialog).getByText(
        "Bạn sẽ không mở được mục này nữa. Bài giao bạn đã tạo từ nó vẫn chạy bình thường. Phan Minh Đức có thể chia sẻ lại với bạn.",
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Gỡ" }));

    expect(await screen.findByText("Đã gỡ khỏi Được chia sẻ với tôi")).toBeVisible();
    expect(state.removed).toEqual([MOCK.shareId]);
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /IELTS Writing/ })).toBeNull(),
    );
    expect(tab("Tất cả")).toHaveTextContent("Tất cả 2");
  });

  it("has the sidebar's count read again once an item leaves the list", async () => {
    const { user, client } = renderPage();
    await screen.findByRole("row", { name: /IELTS Writing/ });
    client.setQueryData(dashboardKeys.summary, { sharedWithMe: 3 });

    await user.click(
      within(row("IELTS Writing")).getByRole("button", {
        name: "Gỡ khỏi danh sách của tôi",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Gỡ" }));
    await waitFor(() =>
      expect(client.getQueryState(dashboardKeys.summary)?.isInvalidated).toBe(true),
    );
  });

  it("says nobody can share it again when the owner's account is disabled (Q3)", async () => {
    const { user } = renderPage();
    await screen.findByRole("row", { name: /Phrasal verbs/ });

    await user.click(
      within(row("Phrasal verbs")).getByRole("button", {
        name: "Gỡ khỏi danh sách của tôi",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Bạn sẽ không mở được mục này nữa. Bài giao bạn đã tạo từ nó vẫn chạy bình thường. Tài khoản của Lý Thanh Vân đã bị vô hiệu hoá, nên hiện không ai chia sẻ lại được.",
      ),
    ).toBeVisible();
  });

  it.each([
    ["copy", "Tạo bản sao", "Tạo bản sao"],
    ["remove", "Gỡ khỏi danh sách của tôi", "Gỡ"],
  ])(
    "answers an item no longer shared with one toast and a fresh list (%s)",
    async (_act, button, confirm) => {
      state.actionStatus = 404;
      const { user } = renderPage();
      await screen.findByRole("row", { name: /IELTS Writing/ });
      const reads = state.reads.length;

      await user.click(
        within(row("IELTS Writing")).getByRole("button", { name: button }),
      );
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: confirm,
        }),
      );

      expect(
        await screen.findByText("Mục này không còn được chia sẻ với bạn."),
      ).toBeVisible();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(state.reads).toHaveLength(reads + 1));
    },
  );

  it("says nothing is shared yet, with no action, when nothing is", async () => {
    state.items = [];
    renderPage();

    expect(
      await screen.findByText(
        "Chưa có gì được chia sẻ với bạn. Khi một giáo viên chia sẻ đề thi hoặc bộ câu hỏi, nó sẽ hiện ở đây.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xoá bộ lọc" })).toBeNull();
  });

  it("says nothing matches a search, and Clear filters goes back to everything", async () => {
    const { user, router } = renderPage("?kind=test&q=speaking");

    expect(await screen.findByText("Không có mục nào khớp.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Xoá bộ lọc" }));

    await screen.findByRole("row", { name: /Collocations/ });
    expect(router.state.location.search).toBe("");
    expect(screen.getByPlaceholderText("Tìm theo tên hoặc giáo viên")).toHaveValue("");
    expect(tab("Tất cả")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows skeleton rows while the list loads, and no counts yet", async () => {
    state.listHang = true;
    renderPage();

    expect(await screen.findByRole("status", { name: "Đang tải…" })).toBeVisible();
    expect(tab("Tất cả")).toHaveTextContent(/^Tất cả$/);
    expect(screen.queryByRole("navigation", { name: "Phân trang" })).toBeNull();
  });

  it("says the list could not load, inside the card, and Retry loads it", async () => {
    state.listStatus = 500;
    const { user } = renderPage();

    expect(
      await screen.findByText("Không tải được danh sách được chia sẻ với bạn."),
    ).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Phân trang" })).toBeNull();

    state.listStatus = 200;
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("row", { name: /IELTS Writing/ })).toBeVisible();
  });

  it("closes with the product's pager, in “mục”", async () => {
    renderPage();
    const pager = await screen.findByRole("navigation", { name: "Phân trang" });

    expect(pager).toHaveTextContent("1–3 trên 3 mục");
    expect(pager).toHaveTextContent("Trang 1 trên 1");
  });
});
