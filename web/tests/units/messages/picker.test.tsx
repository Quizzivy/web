import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { deckClass } from "@tests/support/calendar";
import { contentWidth } from "@tests/support/contentWidth";
import { contractJson } from "@tests/support/contractResponse";
import {
  installIntersectionObserver,
  scrollAllIntoView,
} from "@tests/support/intersection";
import { server } from "@tests/support/server";
import {
  BASE,
  HA,
  NAM,
  direct,
  freshState,
  renderPage,
  serve,
  signIn,
  student,
  uid,
  type State,
} from "./support";

type Recipient = components["schemas"]["MessageRecipient"];

const MINH = uid(21, "0192");
const CHAU = uid(22, "0192");
const ANH = uid(23, "0192");

function recipient(
  id: string,
  name: string,
  extra: Partial<Recipient> = {},
): Recipient {
  return {
    id,
    name,
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

const EVENING = deckClass("evening");

let state: State;
let asked: URL[];
let pages: Record<string, { recipients: Recipient[]; nextCursor: string | null }>;
let failing: boolean;
let gate: Promise<void>;

beforeEach(() => {
  state = freshState();
  serve(state);
  signIn();
  installIntersectionObserver();
  asked = [];
  failing = false;
  gate = Promise.resolve();
  pages = {
    first: {
      recipients: [
        recipient(ANH, "Trần Minh Anh", {
          classNames: ["IELTS 6.5 Evening"],
          otherClassNames: ["Speaking Club Saturday"],
        }),
        recipient(MINH, "Hoàng Đức Minh", { otherClassNames: ["Kids Starters B"] }),
        recipient(CHAU, "Lâm Minh Châu"),
        recipient(NAM, "Lê Hoàng Nam", {
          classNames: ["IELTS 6.5 Evening"],
          threadExists: true,
        }),
      ],
      nextCursor: null,
    },
  };
  server.use(
    http.get(`${BASE}/teacher/messages/recipients`, async ({ request }) => {
      const url = new URL(request.url);
      asked.push(url);
      await gate;
      if (failing)
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "Down.", requestId: uid(996) } },
          { status: 500 },
        );
      const page = pages[url.searchParams.get("cursor") ?? "first"] ?? {
        recipients: [],
        nextCursor: null,
      };
      const q = url.searchParams.get("q");
      return contractJson("/teacher/messages/recipients", "get", 200, {
        recipients:
          q === null
            ? page.recipients
            : page.recipients.filter((row) =>
                row.name.toLowerCase().includes(q.toLowerCase()),
              ),
        nextCursor: q === null ? page.nextCursor : null,
      });
    }),
    http.get(`${BASE}/teacher/classes`, () =>
      contractJson("/teacher/classes", "get", 200, {
        items: [EVENING],
        page: 1,
        pageSize: 100,
        total: 1,
        facets: { all: 1, joinable: 0, archived: 0, students: 18 },
      }),
    ),
  );
});

afterEach(() => {
  useAuthStore.getState().clearSession();
});

const NAM_PATH = `/teacher/messages/student/${NAM}`;

async function openPicker() {
  await userEvent.click(screen.getByRole("button", { name: "Tin nhắn mới" }));
  return screen.findByRole("dialog", { name: "Tin nhắn mới" });
}

function lastAsked(): URL {
  return asked.at(-1)!;
}

describe("New message (T-F2.6)", () => {
  it("lists every student with their classes, the caller's first, or In no class, and marks a thread", async () => {
    contentWidth(1000);
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const dialog = await openPicker();
    expect(
      within(dialog).getByText(
        "Chọn một học viên hoặc một đồng nghiệp. Chỉ hai người trong cuộc trò chuyện đọc được tin nhắn.",
      ),
    ).toBeInTheDocument();
    const anh = await within(dialog).findByRole("option", { name: /Trần Minh Anh/ });
    expect(anh).toHaveTextContent("IELTS 6.5 Evening, Speaking Club Saturday");
    expect(
      within(dialog).getByRole("option", { name: /Hoàng Đức Minh/ }),
    ).toHaveTextContent("Kids Starters B");
    expect(
      within(dialog).getByRole("option", { name: /Lâm Minh Châu/ }),
    ).toHaveTextContent("Chưa vào lớp nào");
    expect(
      within(dialog).getByRole("option", { name: /Lê Hoàng Nam/ }),
    ).toHaveTextContent("Đã có cuộc trò chuyện");
    expect(anh).not.toHaveTextContent("Đã có cuộc trò chuyện");
    expect(
      within(dialog).getByRole("combobox", { name: "Tìm theo tên" }),
    ).toHaveFocus();

    const url = lastAsked();
    expect(url.searchParams.get("audience")).toBe("students");
    for (const name of ["mine", "classId", "inNoClass", "q", "cursor"])
      expect(url.searchParams.has(name)).toBe(false);
  });

  it("filters by the caller's classes, one class, or no class, one filter at a time", async () => {
    contentWidth(1000);
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const dialog = await openPicker();
    await within(dialog).findByRole("option", { name: /Trần Minh Anh/ });
    const filter = within(dialog).getByRole("combobox", { name: "Lọc học viên" });
    expect(filter).toHaveTextContent("Tất cả học viên");

    const choose = async (name: string) => {
      await userEvent.click(filter);
      await userEvent.click(await screen.findByRole("option", { name }));
    };

    await choose("Học viên lớp của tôi");
    await waitFor(() => expect(lastAsked().searchParams.get("mine")).toBe("true"));
    expect(lastAsked().searchParams.has("classId")).toBe(false);

    await choose("IELTS 6.5 Evening");
    await waitFor(() =>
      expect(lastAsked().searchParams.get("classId")).toBe(EVENING.id),
    );
    expect(lastAsked().searchParams.has("mine")).toBe(false);
    expect(lastAsked().searchParams.has("inNoClass")).toBe(false);

    await choose("Chưa vào lớp nào");
    await waitFor(() => expect(lastAsked().searchParams.get("inNoClass")).toBe("true"));
    expect(lastAsked().searchParams.has("classId")).toBe(false);
  });

  it("searches by name, and says so when nothing matches", async () => {
    contentWidth(1000);
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const dialog = await openPicker();
    await within(dialog).findByRole("option", { name: /Trần Minh Anh/ });
    const search = within(dialog).getByRole("combobox", { name: "Tìm theo tên" });

    await userEvent.type(search, "minh");
    await waitFor(() => expect(lastAsked().searchParams.get("q")).toBe("minh"));
    await waitFor(() =>
      expect(within(dialog).queryByRole("option", { name: /Lê Hoàng Nam/ })).toBeNull(),
    );
    expect(
      within(dialog).getByRole("option", { name: /Hoàng Đức Minh/ }),
    ).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, "khoa");
    expect(
      await within(dialog).findByText("Không có học viên nào khớp với “khoa”."),
    ).toBeInTheDocument();
  });

  it("reads the next page when the end of the list scrolls into view", async () => {
    contentWidth(1000);
    pages["first"]!.nextCursor = "second";
    pages["second"] = {
      recipients: [
        recipient(uid(24, "0192"), "Võ Khánh Linh", {
          otherClassNames: ["TOEIC 600 Weekend"],
        }),
      ],
      nextCursor: null,
    };
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const dialog = await openPicker();
    await within(dialog).findByRole("option", { name: /Trần Minh Anh/ });
    expect(within(dialog).queryByRole("option", { name: /Võ Khánh Linh/ })).toBeNull();

    scrollAllIntoView();
    expect(
      await within(dialog).findByRole("option", { name: /Võ Khánh Linh/ }),
    ).toBeInTheDocument();
    expect(lastAsked().searchParams.get("cursor")).toBe("second");
    expect(within(dialog).getAllByRole("option")).toHaveLength(5);
  });

  it("opens the existing thread of a row that has one, with the composer focused", async () => {
    contentWidth(1000);
    state.threads = [direct(HA, "Phạm Thu Hà"), direct(NAM, "Lê Hoàng Nam")];
    const { router } = renderPage(`/teacher/messages/student/${HA}`);
    await screen.findByText("Chào em.");
    const dialog = await openPicker();
    await userEvent.click(
      await within(dialog).findByRole("option", { name: /Lê Hoàng Nam/ }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe(NAM_PATH));
    expect(screen.queryByRole("dialog", { name: "Tin nhắn mới" })).toBeNull();
    const box = await screen.findByRole("textbox", { name: "Nhắn cho Nam…" });
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("opens an empty thread for a student never written to, picked with the keyboard", async () => {
    contentWidth(1000);
    state.messages = [];
    state.peer = student({
      id: MINH,
      name: "Hoàng Đức Minh",
      classes: [],
      otherClassNames: ["Kids Starters B"],
    });
    const { router } = renderPage("/teacher/messages");
    await screen.findByRole("link", { name: /Lê Hoàng Nam/ });
    const dialog = await openPicker();
    await within(dialog).findByRole("option", { name: /Trần Minh Anh/ });
    const search = within(dialog).getByRole("combobox", { name: "Tìm theo tên" });

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    const minh = within(dialog).getByRole("option", { name: /Hoàng Đức Minh/ });
    expect(minh).toHaveAttribute("aria-selected", "true");
    expect(search).toHaveAttribute("aria-activedescendant", minh.id);
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/teacher/messages/student/${MINH}`),
    );
    expect(await screen.findByText("Chưa có tin nhắn.")).toBeInTheDocument();
    const box = await screen.findByRole("textbox", { name: "Nhắn cho Minh…" });
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("shows a skeleton while the list loads, and an error with Retry that reads it again", async () => {
    contentWidth(1000);
    failing = true;
    let release = () => {};
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const dialog = await openPicker();
    expect(
      within(dialog).getByRole("status", { name: "Đang tải…" }),
    ).toBeInTheDocument();
    release();
    expect(
      await within(dialog).findByText("Không tải được danh sách."),
    ).toBeInTheDocument();

    failing = false;
    await userEvent.click(within(dialog).getByRole("button", { name: "Thử lại" }));
    expect(
      await within(dialog).findByRole("option", { name: /Trần Minh Anh/ }),
    ).toBeInTheDocument();
  });
});

describe("a student the caller does not teach (T-F2.6)", () => {
  it("names the student's other classes, or In no class, in the search's candidates", async () => {
    contentWidth(1000);
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    state.threads = [
      direct(NAM, "Lê Hoàng Nam"),
      direct(MINH, "Hoàng Đức Minh", {
        candidate: true,
        classNames: [],
        otherClassNames: ["Kids Starters B"],
        lastMessageAt: null,
        preview: null,
      }),
      direct(CHAU, "Lâm Minh Châu", {
        candidate: true,
        classNames: [],
        lastMessageAt: null,
        preview: null,
      }),
    ];
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Tìm người và lớp" }),
      "minh",
    );
    const candidates = await screen.findByRole("list", {
      name: "Học viên chưa nhắn tin",
    });
    expect(
      within(candidates).getByRole("link", { name: /Hoàng Đức Minh/ }),
    ).toHaveTextContent("Kids Starters B");
    expect(
      within(candidates).getByRole("link", { name: /Lâm Minh Châu/ }),
    ).toHaveTextContent("Chưa vào lớp nào");
  });

  it("puts their classes under the name, and in Details with one sentence and no link", async () => {
    contentWidth(1000);
    state.peer = student({ classes: [], otherClassNames: ["Kids Starters B"] });
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const thread = screen.getByRole("region", { name: "Lê Hoàng Nam" });
    expect(within(thread).getByText("Kids Starters B")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Chi tiết" }));
    const details = await screen.findByRole("dialog", { name: "Chi tiết" });
    expect(within(details).getByText("Lớp đang học")).toBeInTheDocument();
    expect(within(details).getByText("Kids Starters B")).toBeInTheDocument();
    expect(within(details).getByText("Không học lớp nào của bạn.")).toBeInTheDocument();
    expect(within(details).queryByRole("link")).toBeNull();
  });

  it("says In no class under the name, and in Details with no list", async () => {
    contentWidth(1000);
    state.peer = student({ classes: [], otherClassNames: [] });
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const thread = screen.getByRole("region", { name: "Lê Hoàng Nam" });
    expect(within(thread).getByText("Chưa vào lớp nào")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Chi tiết" }));
    const details = await screen.findByRole("dialog", { name: "Chi tiết" });
    expect(
      within(details).getByText("Chưa vào lớp nào của trung tâm."),
    ).toBeInTheDocument();
    expect(within(details).queryByText("Lớp đang học")).toBeNull();
    expect(within(details).queryByRole("link")).toBeNull();
  });

  it("keeps Details of a student the caller teaches as R7 drew it", async () => {
    contentWidth(1000);
    state.peer = student({ otherClassNames: ["Kids Starters B"] });
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    await userEvent.click(screen.getByRole("button", { name: "Chi tiết" }));
    const details = await screen.findByRole("dialog", { name: "Chi tiết" });
    expect(within(details).getByText("Lớp đang học với bạn")).toBeInTheDocument();
    expect(
      within(details).getByRole("link", { name: /Mở trong Học viên/ }),
    ).toBeVisible();
    expect(within(details).queryByText("Kids Starters B")).toBeNull();
  });
});
