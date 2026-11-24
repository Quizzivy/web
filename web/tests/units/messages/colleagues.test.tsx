import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import TeacherMessagesPage from "@/features/messages/pages/teacher/TeacherMessagesPage";
import { mergeByLatest } from "@/features/messages/merge";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contentWidth } from "@tests/support/contentWidth";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import {
  installIntersectionObserver,
  scrollAllIntoView,
} from "@tests/support/intersection";
import { server } from "@tests/support/server";
import {
  BASE,
  C1,
  GUIDE,
  HA,
  NAM,
  channel,
  direct,
  freshState,
  serve,
  signIn,
  uid,
  type State,
} from "./support";

type Schemas = components["schemas"];
type Colleague = Schemas["ColleagueThread"];
type Message = Schemas["StaffMessage"];

const DUC = uid(31, "0194");
const THUONG = uid(32, "0194");
const VAN = uid(33, "0194");
const TRANG = uid(34, "0194");

const KEY: Schemas["MessageAttachment"] = {
  id: uid(902),
  filename: "Tiêu chí chấm Writing Task 2.docx",
  bytes: 122_880,
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function colleague(
  id: string,
  title: string,
  extra: Partial<Colleague> = {},
): Colleague {
  return {
    colleagueId: id,
    title,
    avatarUrl: null,
    roleName: "Giáo viên",
    roleBuiltinKey: "teacher",
    candidate: false,
    disabled: false,
    lastMessageAt: "2026-11-16T13:10:00Z",
    preview: { text: "Cảm ơn chị.", attachmentName: null, mine: false },
    unread: 0,
    ...extra,
  };
}

function said(
  n: number,
  mine: boolean,
  body: string | null,
  extra: Partial<Message> = {},
): Message {
  return {
    id: uid(n),
    sender: mine
      ? {
          id: teacherUser.id,
          name: teacherUser.fullName,
          avatarUrl: null,
          side: "staff",
        }
      : { id: DUC, name: "Phan Minh Đức", avatarUrl: null, side: "staff" },
    body,
    attachment: null,
    createdAt: new Date(Date.UTC(2026, 10, 16, 12, n % 60)).toISOString(),
    mine,
    ...extra,
  };
}

type Peers = {
  threads: Colleague[];
  messages: Message[];
  peer: Schemas["ColleagueDirectThreadPeer"];
  posts: { id: string; body: Schemas["StaffMessagePost"] }[];
  postStatus: number;
  marks: { id: string; to: string }[];
  reads: string[];
};

let state: State;
let peers: Peers;

beforeEach(() => {
  state = freshState();
  serve(state);
  signIn();
  installIntersectionObserver();
  peers = {
    threads: [],
    messages: [
      said(10, false, "Chị Giàu ơi, em gửi chị bộ thẻ gợi ý."),
      said(11, true, "Cảm ơn em."),
    ],
    peer: {
      id: DUC,
      name: "Phan Minh Đức",
      avatarUrl: null,
      roleName: "Giáo viên",
      roleBuiltinKey: "teacher",
      disabled: false,
      canPost: true,
    },
    posts: [],
    postStatus: 201,
    marks: [],
    reads: [],
  };
  server.use(
    http.get(`${BASE}/teacher/messages/colleagues`, ({ request }) => {
      const q = new URL(request.url).searchParams.get("q");
      return contractJson("/teacher/messages/colleagues", "get", 200, {
        threads:
          q === null ? peers.threads.filter((row) => !row.candidate) : peers.threads,
      });
    }),
    http.get(`${BASE}/teacher/messages/colleagues/:id`, ({ params }) => {
      peers.reads.push(String(params["id"]));
      return contractJson("/teacher/messages/colleagues/{colleagueId}", "get", 200, {
        colleague: { ...peers.peer, id: String(params["id"]) },
        messages: peers.messages,
        nextBefore: null,
        latestId: peers.messages.at(-1)?.id ?? null,
      });
    }),
    http.post(
      `${BASE}/teacher/messages/colleagues/:id`,
      async ({ params, request }) => {
        const body = (await request.json()) as Schemas["StaffMessagePost"];
        peers.posts.push({ id: String(params["id"]), body });
        if (peers.postStatus === 409)
          return HttpResponse.json(
            {
              error: {
                code: "MESSAGING_NOT_ALLOWED",
                message: "No.",
                requestId: uid(995),
              },
            },
            { status: 409 },
          );
        const made = said(50 + peers.posts.length, true, body.body ?? null, {
          attachment: body.attachmentId ? GUIDE : null,
        });
        peers.messages.push(made);
        return contractJson(
          "/teacher/messages/colleagues/{colleagueId}",
          "post",
          201,
          made,
        );
      },
    ),
    http.post(
      `${BASE}/teacher/messages/colleagues/:id/read`,
      async ({ params, request }) => {
        const body = (await request.json()) as { lastReadMessageId: string };
        peers.marks.push({ id: String(params["id"]), to: body.lastReadMessageId });
        return new HttpResponse(null, { status: 204 });
      },
    ),
  );
});

afterEach(() => {
  useAuthStore.getState().clearSession();
});

const DUC_PATH = `/teacher/messages/colleagues/${DUC}`;

/** renderPage mounts Messages at `path` with its four routes, the colleague thread's (F2) among them. */
function renderPage(path: string | Readonly<{ pathname: string; state: unknown }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = <TeacherMessagesPage />;
  const router = createMemoryRouter(
    [
      { path: "/teacher/messages", element },
      { path: "/teacher/messages/class/:classId", element },
      { path: "/teacher/messages/student/:studentId", element },
      { path: "/teacher/messages/colleagues/:colleagueId", element },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

function names(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole("link")
    .map((link) => link.querySelector(".text-ui")?.textContent ?? "");
}

describe("mergeByLatest (T-F2.7)", () => {
  it("puts each colleague row before the first staff row it is newer than, keeping each list's order", () => {
    const merged = mergeByLatest(
      [
        direct(NAM, "Lê Hoàng Nam", { lastMessageAt: "2026-11-16T13:32:00Z" }),
        direct(HA, "Phạm Thu Hà", { lastMessageAt: "2026-11-16T11:02:00Z" }),
        channel(C1, "IELTS 6.5 Evening", { lastMessageAt: null }),
      ],
      [
        colleague(DUC, "Phan Minh Đức", { lastMessageAt: "2026-11-16T13:10:00Z" }),
        colleague(THUONG, "Thường Võ", { lastMessageAt: "2026-11-16T11:02:00Z" }),
        colleague(VAN, "Lý Thanh Vân", { lastMessageAt: "2026-11-12T02:40:00Z" }),
      ],
    );
    expect(merged.map((row) => `${row.ref.kind}:${row.row.title}`)).toEqual([
      "direct:Lê Hoàng Nam",
      "colleague:Phan Minh Đức",
      // Equal times keep the staff row first.
      "direct:Phạm Thu Hà",
      "colleague:Thường Võ",
      "colleague:Lý Thanh Vân",
      // A channel nobody has posted in stays last.
      "class:IELTS 6.5 Evening",
    ]);
  });
});

describe("colleague threads in the list (T-F2.7)", () => {
  it("merges colleague rows into All by their last message, and lists them alone under Colleagues", async () => {
    contentWidth(1000);
    state.threads = [
      direct(NAM, "Lê Hoàng Nam", { lastMessageAt: "2026-11-16T13:32:00Z" }),
      channel(C1, "IELTS 6.5 Evening", { lastMessageAt: "2026-11-16T10:42:00Z" }),
    ];
    peers.threads = [
      colleague(DUC, "Phan Minh Đức", { unread: 1 }),
      colleague(THUONG, "Thường Võ", {
        roleName: "Quản trị viên",
        roleBuiltinKey: "admin",
        lastMessageAt: "2026-11-15T09:00:00Z",
        preview: { text: "Dạ em gửi lịch thi thử.", attachmentName: null, mine: true },
      }),
    ];
    renderPage(`/teacher/messages/student/${NAM}`);
    const list = await screen.findByRole("complementary", { name: "Cuộc trò chuyện" });
    await waitFor(() =>
      expect(names(list)).toEqual([
        "Lê Hoàng Nam",
        "Phan Minh Đức",
        "IELTS 6.5 Evening",
        "Thường Võ",
      ]),
    );
    expect(within(list).getByRole("link", { name: /Thường Võ/ })).toHaveTextContent(
      "Bạn: Dạ em gửi lịch thi thử.",
    );

    const tab = screen.getByRole("button", { name: /Đồng nghiệp/ });
    expect(tab).toHaveTextContent("1");
    await userEvent.click(tab);
    expect(names(list)).toEqual(["Phan Minh Đức", "Thường Võ"]);

    await userEvent.click(screen.getByRole("button", { name: /Riêng/ }));
    expect(names(list)).toEqual(["Lê Hoàng Nam"]);
  });

  it("says how to start one under Colleagues when there is none", async () => {
    contentWidth(1000);
    renderPage({ pathname: "/teacher/messages", state: { tab: "colleagues" } });
    const list = await screen.findByRole("complementary", { name: "Cuộc trò chuyện" });
    expect(
      await within(list).findByText(
        "Chưa có tin nhắn với đồng nghiệp. Bấm “Tin nhắn mới” để nhắn cho một đồng nghiệp.",
      ),
    ).toBeInTheDocument();
  });

  it("finds colleagues with no thread under their own label, with the role as the sub-line", async () => {
    contentWidth(1000);
    peers.threads = [
      colleague(TRANG, "Nguyễn Thu Trang", {
        candidate: true,
        lastMessageAt: null,
        preview: null,
      }),
    ];
    renderPage(`/teacher/messages/student/${NAM}`);
    await screen.findByText("Chào em.");
    state.threads = [
      direct(NAM, "Lê Hoàng Nam"),
      direct(HA, "Phạm Thu Hà", {
        candidate: true,
        lastMessageAt: null,
        preview: null,
      }),
    ];
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Tìm người và lớp" }),
      "thu",
    );
    const found = await screen.findByRole("list", {
      name: "Đồng nghiệp chưa nhắn tin",
    });
    expect(
      within(found).getByRole("link", { name: /Nguyễn Thu Trang/ }),
    ).toHaveTextContent("Giáo viên");
    expect(
      within(found).getByRole("link", { name: /Nguyễn Thu Trang/ }),
    ).toHaveAttribute("href", `/teacher/messages/colleagues/${TRANG}`);
    expect(
      screen.getByRole("list", { name: "Học viên chưa nhắn tin" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Riêng/ }));
    expect(
      screen.queryByRole("list", { name: "Đồng nghiệp chưa nhắn tin" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Đồng nghiệp/ }));
    expect(screen.queryByRole("list", { name: "Học viên chưa nhắn tin" })).toBeNull();
    expect(
      screen.getByRole("list", { name: "Đồng nghiệp chưa nhắn tin" }),
    ).toBeInTheDocument();
  });
});

describe("a colleague thread (T-F2.7)", () => {
  it("opens at its route with the role as the sub-line, sends there and moves its own read pointer", async () => {
    contentWidth(1000);
    peers.threads = [colleague(DUC, "Phan Minh Đức", { unread: 1 })];
    renderPage(DUC_PATH);
    expect(
      await screen.findByText("Chị Giàu ơi, em gửi chị bộ thẻ gợi ý."),
    ).toBeInTheDocument();
    const thread = screen.getByRole("region", { name: "Phan Minh Đức" });
    expect(within(thread).getByText("Giáo viên")).toBeInTheDocument();
    expect(peers.reads).toContain(DUC);
    expect(state.reads).toHaveLength(0);

    act(() => scrollAllIntoView());
    await waitFor(() => expect(peers.marks).toEqual([{ id: DUC, to: uid(11) }]), {
      timeout: 3000,
    });
    const box = screen.getByRole("textbox", { name: "Nhắn cho Đức…" });
    await userEvent.type(box, "Tuần sau em thử nhé{Enter}");
    expect(await screen.findByText("Tuần sau em thử nhé")).toBeInTheDocument();
    expect(peers.posts).toHaveLength(1);
    expect(peers.posts[0]!.id).toBe(DUC);
    expect(peers.posts[0]!.body.body).toBe("Tuần sau em thử nhé");
    expect(state.posts).toHaveLength(0);
  });

  it("names who can read an empty one", async () => {
    contentWidth(1000);
    peers.messages = [];
    peers.peer = { ...peers.peer, name: "Nguyễn Thu Trang" };
    renderPage(`/teacher/messages/colleagues/${TRANG}`);
    expect(
      await screen.findByText(
        "Chưa có tin nhắn. Chỉ bạn và Nguyễn Thu Trang đọc được cuộc trò chuyện này.",
      ),
    ).toBeInTheDocument();
  });

  it("replaces the composer with R7's sentence when the colleague's account is disabled", async () => {
    contentWidth(1000);
    peers.peer = {
      ...peers.peer,
      name: "Lý Thanh Vân",
      disabled: true,
      canPost: false,
    };
    renderPage(`/teacher/messages/colleagues/${VAN}`);
    expect(
      await screen.findByText(
        "Tài khoản của Lý Thanh Vân đã bị vô hiệu hoá nên không nhắn được.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Nhắn cho/ })).toBeNull();
    expect(
      screen.getByText("Chị Giàu ơi, em gửi chị bộ thẻ gợi ý."),
    ).toBeInTheDocument();
  });

  it("decides the composer by canPost: a colleague who lost the workspace is not disabled but takes no post", async () => {
    contentWidth(1000);
    peers.threads = [colleague(DUC, "Phan Minh Đức")];
    peers.peer = { ...peers.peer, disabled: false, canPost: false };
    renderPage(DUC_PATH);
    expect(
      await screen.findByText(
        "Tài khoản của Phan Minh Đức đã bị vô hiệu hoá nên không nhắn được.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Nhắn cho/ })).toBeNull();
  });

  it("gives the composer's place to the sentence on 409 MESSAGING_NOT_ALLOWED", async () => {
    contentWidth(1000);
    peers.postStatus = 409;
    renderPage(DUC_PATH);
    const box = await screen.findByRole("textbox", { name: "Nhắn cho Đức…" });
    await userEvent.type(box, "Chị ơi{Enter}");
    expect(
      await screen.findByText(
        "Tài khoản của Phan Minh Đức đã bị vô hiệu hoá nên không nhắn được.",
      ),
    ).toBeInTheDocument();
  });

  it("lists the files in the thread in Details, newest first, with no link", async () => {
    contentWidth(1000);
    peers.messages = [
      said(10, false, null, { attachment: GUIDE }),
      said(11, true, "Chị gửi lại tiêu chí chấm.", { attachment: KEY }),
    ];
    renderPage(DUC_PATH);
    await screen.findByText("Chị gửi lại tiêu chí chấm.");
    await userEvent.click(screen.getByRole("button", { name: "Chi tiết" }));
    const details = await screen.findByRole("dialog", { name: "Chi tiết" });
    expect(within(details).getByText("Giáo viên")).toBeInTheDocument();
    expect(within(details).getByText("Tệp đã chia sẻ")).toBeInTheDocument();
    const files = within(details)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(files).toEqual([KEY.filename, GUIDE.filename]);
    expect(within(details).queryByRole("link")).toBeNull();
  });

  it("is opened from New message's Colleagues with the composer focused", async () => {
    contentWidth(1000);
    server.use(
      http.get(`${BASE}/teacher/messages/recipients`, ({ request }) => {
        const audience = new URL(request.url).searchParams.get("audience");
        return contractJson("/teacher/messages/recipients", "get", 200, {
          recipients:
            audience === "colleagues"
              ? [
                  {
                    id: DUC,
                    name: "Phan Minh Đức",
                    avatarUrl: null,
                    classNames: [],
                    otherClassNames: [],
                    roleName: "Giáo viên",
                    roleBuiltinKey: "teacher",
                    threadExists: true,
                    canPost: true,
                  },
                ]
              : [],
          nextCursor: null,
        });
      }),
      http.get(`${BASE}/teacher/classes`, () =>
        contractJson("/teacher/classes", "get", 200, {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
          facets: { all: 0, joinable: 0, archived: 0, students: 0 },
        }),
      ),
    );
    const { router } = renderPage(`/teacher/messages/student/${NAM}`);
    await screen.findByText("Chào em.");
    await userEvent.click(screen.getByRole("button", { name: "Tin nhắn mới" }));
    const dialog = await screen.findByRole("dialog", { name: "Tin nhắn mới" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Đồng nghiệp" }));
    expect(within(dialog).queryByRole("combobox", { name: "Lọc học viên" })).toBeNull();
    const row = await within(dialog).findByRole("option", { name: /Phan Minh Đức/ });
    expect(row).toHaveTextContent("Giáo viên");
    expect(row).toHaveTextContent("Đã có cuộc trò chuyện");
    await userEvent.click(row);

    await waitFor(() => expect(router.state.location.pathname).toBe(DUC_PATH));
    const box = await screen.findByRole("textbox", { name: "Nhắn cho Đức…" });
    await waitFor(() => expect(box).toHaveFocus());
  });
});
