import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http } from "msw";
import TestsListPage from "@/features/tests/pages/teacher/TestsListPage";
import { Toaster, toast } from "@/components/ui/sonner";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import {
  detail,
  renderDetail,
  serveDetail,
  testFixture,
} from "@tests/units/tests/detailHarness";
import { BASE, DUC, grant, serveSharing, state } from "./support";

type Test = components["schemas"]["Test"];

const OTHER = { id: "019535d9-3df7-79fb-b466-fa907fa17fb1", name: "Phan Minh Đức" };

const MINE = testFixture({
  id: "018f0000-0000-7000-8000-0000000000f1",
  title: "Unit 5",
  sharedWith: 0,
});
const MINE_SHARED = testFixture({
  id: "018f0000-0000-7000-8000-0000000000f2",
  title: "Unit 6",
  sharedWith: 2,
});
const THEIRS = testFixture({
  id: "018f0000-0000-7000-8000-0000000000f3",
  title: "Mock IELTS",
  access: "edit",
  owner: OTHER,
  sharedWith: 0,
});

function serveList(items: Test[]) {
  server.use(
    http.get(`${BASE}/teacher/tests`, () =>
      contractJson("/teacher/tests", "get", 200, {
        items,
        page: 1,
        pageSize: 24,
        total: items.length,
        facets: { all: items.length, draft: 0, published: items.length, archived: 0 },
        tags: [],
      }),
    ),
  );
}

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: "/teacher/tests", element: <TestsListPage /> }],
    { initialEntries: ["/teacher/tests"] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function card(title: string) {
  const link = await screen.findByRole("link", { name: title });
  return link.closest("article")!;
}

function signIn(permissions = teacherUser.permissions) {
  useAuthStore.setState({
    user: { ...teacherUser, permissions },
    accessToken: "token",
  });
}

beforeEach(() => {
  serveSharing();
  signIn();
});

afterEach(() => {
  toast.dismiss();
  useAuthStore.setState({ user: null, accessToken: null });
});

describe("the tests list's share button", () => {
  it("reads Share, or Shared · {n} with who has it, on the owner's cards only", async () => {
    serveList([MINE, MINE_SHARED, THEIRS]);
    renderList();

    const mine = await card("Unit 5");
    expect(
      within(mine).getByRole("button", { name: "Chia sẻ Unit 5" }),
    ).toHaveTextContent("Chia sẻ");
    const shared = await card("Unit 6");
    expect(
      within(shared).getByRole("button", {
        name: "Đã chia sẻ với 2 giáo viên. Quản lý chia sẻ",
      }),
    ).toHaveTextContent("Đã chia sẻ · 2");
    const theirs = await card("Mock IELTS");
    expect(within(theirs).queryByRole("button", { name: /chia sẻ/i })).toBeNull();
  });

  it("is absent without content.share", async () => {
    signIn(teacherUser.permissions.filter((key) => key !== "content.share"));
    serveList([MINE]);
    renderList();

    const mine = await card("Unit 5");
    expect(within(mine).queryByRole("button", { name: /chia sẻ/i })).toBeNull();
  });

  it("opens the dialog for its test and gives focus back when it closes", async () => {
    serveList([MINE]);
    const user = renderList();
    const button = within(await card("Unit 5")).getByRole("button", {
      name: "Chia sẻ Unit 5",
    });

    await user.click(button);
    expect(
      await screen.findByRole("dialog", { name: "Chia sẻ “Unit 5”" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Xong" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
  });
});

describe("the test detail's share button", () => {
  beforeEach(() => serveDetail());

  it("sits in the owner's header and reads Shared with {n} once shared", async () => {
    detail.test = testFixture({ sharedWith: 1 });
    state.grants = [grant(1, DUC, "use")];
    const user = userEvent.setup();
    renderDetail();

    const button = await screen.findByRole("button", { name: "Đã chia sẻ với 1" });
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Chia sẻ “Unit 5”" });
    expect(await within(dialog).findByText(DUC.fullName)).toBeVisible();
  });

  it("is absent for a teacher the test is shared with", async () => {
    detail.test = testFixture({ access: "edit", owner: OTHER });
    renderDetail();

    expect(await screen.findByRole("link", { name: "Mở trình soạn đề" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /chia sẻ/i })).toBeNull();
  });
});
