import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { dashboardKeys } from "@/features/dashboard/keys";
import { useAuthStore } from "@/stores/auth";
import { contentWidth } from "@tests/support/contentWidth";
import { teacherUser } from "@tests/support/fixtures";
import { viewport } from "@tests/support/viewport";
import {
  installIntersectionObserver,
  scrollAllIntoView,
} from "@tests/support/intersection";
import { server } from "@tests/support/server";
import {
  BASE,
  C1,
  HA,
  NAM,
  THU,
  channel,
  direct,
  freshState,
  message,
  renderPage,
  serve,
  signIn,
  uid,
  type State,
} from "./support";

let state: State;

beforeEach(() => {
  state = freshState();
  serve(state);
  signIn();
  installIntersectionObserver();
});

afterEach(() => {
  useAuthStore.getState().clearSession();
});

const NAM_PATH = `/teacher/messages/student/${NAM}`;

describe("one pane at a time under 760px of content (the deck's msgSingle)", () => {
  it("shows the list alone, then the thread alone with a back arrow that returns to it", async () => {
    contentWidth(700);
    const { router } = renderPage("/teacher/messages");
    const list = await screen.findByRole("complementary", { name: "Cuộc trò chuyện" });
    expect(document.querySelector("[data-slot=message-stream]")).toBeNull();

    await userEvent.click(within(list).getByRole("link", { name: /Lê Hoàng Nam/ }));
    expect(await screen.findByText("Chào em.")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Cuộc trò chuyện" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Về danh sách" }));
    expect(router.state.location.pathname).toBe("/teacher/messages");
    expect(
      await screen.findByRole("complementary", { name: "Cuộc trò chuyện" }),
    ).toBeInTheDocument();
  });

  it("sets the list and the thread side by side from 760px, opening the first conversation", async () => {
    contentWidth(1000);
    const { router } = renderPage("/teacher/messages");
    expect(await screen.findByText("Chào em.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(NAM_PATH);
    expect(
      screen.getByRole("complementary", { name: "Cuộc trò chuyện" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Về danh sách" })).toBeNull();
    expect(
      within(screen.getByRole("complementary")).getByRole("link", {
        name: /Lê Hoàng Nam/,
      }),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("the list", () => {
  it("adds, while a search is typed, the students not messaged yet, a former one marked so", async () => {
    contentWidth(1000);
    state.threads = [direct(HA, "Phạm Thu Hà")];
    renderPage(`/teacher/messages/student/${HA}`);
    await screen.findByText("Chào em.");
    expect(screen.queryByText("Học viên chưa nhắn tin")).toBeNull();

    state.threads = [
      direct(HA, "Phạm Thu Hà"),
      direct(THU, "Trần Minh Thư", {
        candidate: true,
        former: true,
        classNames: [],
        lastMessageAt: null,
        preview: null,
      }),
    ];
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Tìm người và lớp" }),
      "thu",
    );
    const label = await screen.findByRole("heading", {
      name: "Học viên chưa nhắn tin",
    });
    const candidates = screen.getByRole("list", { name: "Học viên chưa nhắn tin" });
    expect(
      within(candidates).getByRole("link", { name: /Trần Minh Thư/ }),
    ).toHaveTextContent("Học viên cũ");
    expect(label).toBeInTheDocument();
  });

  it("shows a skeleton while the list loads, and an error with Retry that reads it again", async () => {
    contentWidth(1000);
    let fail = true;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${BASE}/teacher/messages/threads`, async () => {
        await gate;
        if (fail)
          return HttpResponse.json(
            { error: { code: "INTERNAL", message: "Down.", requestId: uid(997) } },
            { status: 500 },
          );
        const { contractJson } = await import("@tests/support/contractResponse");
        return contractJson("/teacher/messages/threads", "get", 200, {
          threads: state.threads,
        });
      }),
    );
    renderPage("/teacher/messages");
    const list = await screen.findByRole("complementary", { name: "Cuộc trò chuyện" });
    expect(within(list).getByRole("status", { name: "Đang tải…" })).toBeInTheDocument();

    release();
    expect(
      await within(list).findByText("Không tải được tin nhắn."),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(list).getByRole("button", { name: "Thử lại" }));
    expect(
      await within(list).findByRole("link", { name: /Lê Hoàng Nam/ }),
    ).toBeInTheDocument();
    expect(within(list).queryByText("Không tải được tin nhắn.")).toBeNull();
  });

  it("marks a former student's row Former student, in place of the last message", async () => {
    contentWidth(1000);
    state.threads = [
      direct(NAM, "Lê Hoàng Nam"),
      direct(HA, "Phạm Thu Hà", { former: true, classNames: [] }),
    ];
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const list = screen.getByRole("complementary", { name: "Cuộc trò chuyện" });
    const former = within(list).getByRole("link", { name: /Phạm Thu Hà/ });
    expect(former).toHaveTextContent("Học viên cũ");
    expect(former).not.toHaveTextContent("Em cảm ơn ạ!");
    expect(within(list).getByRole("link", { name: /Lê Hoàng Nam/ })).toHaveTextContent(
      "Em cảm ơn ạ!",
    );
  });

  it("says how to start when there is nothing, with New announcement off and its reason", async () => {
    contentWidth(1000);
    state.threads = [];
    renderPage("/teacher/messages");
    expect(
      await screen.findByText(
        "Chưa có tin nhắn. Nhắn cho một học viên từ trang Học viên, hoặc đăng thông báo tới một lớp.",
      ),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Thông báo mới" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Bạn chưa dạy lớp nào.");
  });

  it("New announcement opens the first class channel on the Classes tab, its composer focused", async () => {
    contentWidth(1000);
    const { router } = renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    await userEvent.click(screen.getByRole("button", { name: "Thông báo mới" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/teacher/messages/class/${C1}`),
    );
    expect(screen.getByRole("button", { name: "Lớp" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const box = await screen.findByRole("textbox", {
      name: "Viết thông báo tới lớp IELTS 6.5 Evening…",
    });
    await waitFor(() => expect(box).toHaveFocus());
    expect(
      screen.getByText(
        "Gửi tới cả 24 học viên. Học viên trả lời bằng tin nhắn riêng cho bạn.",
      ),
    ).toBeInTheDocument();
  });

  it("starts on the Direct tab a link asks for, opening its first conversation from 760px", async () => {
    contentWidth(1000);
    state.threads = [channel(C1, "IELTS 6.5 Evening"), direct(NAM, "Lê Hoàng Nam")];
    const { router } = renderPage({
      pathname: "/teacher/messages",
      state: { tab: "direct" },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe(NAM_PATH));
    expect(screen.getByRole("button", { name: "Riêng" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const list = screen.getByRole("complementary", { name: "Cuộc trò chuyện" });
    expect(within(list).queryByRole("link", { name: /IELTS 6\.5 Evening/ })).toBeNull();
  });

  it("starts on All, opening the first conversation of any kind, when the link names no tab", async () => {
    contentWidth(1000);
    state.threads = [channel(C1, "IELTS 6.5 Evening"), direct(NAM, "Lê Hoàng Nam")];
    const { router } = renderPage({
      pathname: "/teacher/messages",
      state: { tab: "x" },
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/teacher/messages/class/${C1}`),
    );
    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reads the list again when the summary's unread count changes", async () => {
    contentWidth(1000);
    let reads = 0;
    server.use(
      http.get(`${BASE}/teacher/messages/threads`, async () => {
        reads += 1;
        const { contractJson } = await import("@tests/support/contractResponse");
        return contractJson("/teacher/messages/threads", "get", 200, {
          threads: state.threads,
        });
      }),
    );
    const { client } = renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    await waitFor(() =>
      expect(client.getQueryData(dashboardKeys.summary)).toBeDefined(),
    );
    const before = reads;
    act(() =>
      client.setQueryData(dashboardKeys.summary, {
        liveAssignments: 0,
        answersToGrade: 0,
        unreadNotifications: 0,
        sharedWithMe: 0,
        unreadMessages: 4,
      }),
    );
    await waitFor(() => expect(reads).toBe(before + 1));
  });
});

describe("a thread", () => {
  it("replaces the composer with the reason on 409 MESSAGING_NOT_ALLOWED, and keeps the thread", async () => {
    contentWidth(1000);
    state.postStatus = 409;
    renderPage(NAM_PATH);
    const box = await screen.findByRole("textbox", { name: "Nhắn cho Nam…" });
    await userEvent.type(box, "Em ơi{Enter}");
    expect(
      await screen.findByText(
        "Tài khoản của Lê Hoàng Nam đã bị vô hiệu hoá nên không nhắn được.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nhắn cho Nam…" })).toBeNull();
    expect(screen.getByText("Chào em.")).toBeInTheDocument();
  });

  it("says so in Details for a former student, with no link to Students", async () => {
    contentWidth(1000);
    state.peer = { ...state.peer, former: true, classes: [] };
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    expect(screen.getAllByText("Học viên cũ").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Chi tiết" }));
    const details = await screen.findByRole("dialog", { name: "Chi tiết" });
    expect(
      within(details).getByText("Không còn học lớp nào của bạn."),
    ).toBeInTheDocument();
    expect(within(details).queryByRole("link")).toBeNull();
  });

  it("moves the read pointer to the newest message once the end of the thread is in view", async () => {
    contentWidth(1000);
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    act(() => scrollAllIntoView());
    await waitFor(() => expect(state.marks).toEqual([state.messages.at(-1)!.id]), {
      timeout: 2500,
    });
  });

  it("keeps the reader's place when Load earlier adds the messages before", async () => {
    contentWidth(1000);
    state.nextBefore = state.messages[0]!.id;
    state.older = [message(2, false, "Tin cũ một."), message(3, true, "Tin cũ hai.")];
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const stream = document.querySelector<HTMLElement>("[data-slot=message-stream]")!;
    // Each bubble is 200px tall; the reader has scrolled to the top of two.
    Object.defineProperty(stream, "scrollHeight", {
      configurable: true,
      get: () => stream.querySelectorAll("[data-slot=message-bubble]").length * 200,
    });
    Object.defineProperty(stream, "clientHeight", {
      configurable: true,
      get: () => 300,
    });
    stream.scrollTop = 0;
    fireEvent.scroll(stream);

    await userEvent.click(screen.getByRole("button", { name: "Xem tin nhắn cũ hơn" }));
    expect(await screen.findByText("Tin cũ một.")).toBeInTheDocument();
    // 400px stood below the reader's place before; with two more bubbles above, it is 800 − 400.
    expect(stream.scrollTop).toBe(400);
    expect(screen.queryByRole("button", { name: "Xem tin nhắn cũ hơn" })).toBeNull();
  });
});

describe("a thread's cards, Details and place", () => {
  it("sets a flagged attempt at its moment, with Open attempt to the attempt sheet", async () => {
    contentWidth(1000);
    const attemptId = uid(700);
    const assignmentId = uid(701);
    state.events = [
      {
        attemptId,
        assignmentId,
        title: "IELTS Mock 3",
        focusLost: 3,
        at: state.messages[0]!.createdAt,
      },
    ];
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const card = document.querySelector<HTMLElement>("[data-slot=attempt-event]")!;
    expect(card).toHaveTextContent("IELTS Mock 3 · rời khỏi bài thi 3 lần");
    expect(within(card).getByRole("link", { name: "Mở lượt làm bài" })).toHaveAttribute(
      "href",
      `/teacher/assignments/${assignmentId}?attempt=${attemptId}`,
    );
  });

  it("gives a class's Details its member count and a link to the class", async () => {
    contentWidth(1000);
    renderPage(`/teacher/messages/class/${C1}`);
    await screen.findByText("Chưa có thông báo nào.");
    await userEvent.click(screen.getByRole("button", { name: "Chi tiết" }));
    const details = await screen.findByRole("dialog", { name: "Chi tiết" });
    expect(within(details).getByText("24 học viên")).toBeInTheDocument();
    expect(within(details).getByRole("link", { name: "Mở trang lớp" })).toHaveAttribute(
      "href",
      `/teacher/classes/${C1}`,
    );
  });

  it("opens Details as a sheet from the bottom on a phone", async () => {
    viewport("phone");
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    contentWidth(360);
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    await userEvent.click(screen.getByRole("button", { name: "Chi tiết" }));
    const sheet = await screen.findByRole("dialog", { name: "Chi tiết" });
    expect(sheet).toHaveAttribute("data-slot", "dialog-content");
    expect(within(sheet).getByText("IELTS 6.5 Evening")).toBeInTheDocument();
    expect(
      within(sheet).getByRole("link", { name: "Mở trong Học viên" }),
    ).toBeInTheDocument();
  });

  it("follows the end after a Load earlier that failed, when the reader comes back down and sends", async () => {
    contentWidth(1000);
    state.nextBefore = state.messages[0]!.id;
    server.use(
      http.get(`${BASE}/teacher/messages/students/:id`, ({ request }) => {
        if (new URL(request.url).searchParams.has("before"))
          return HttpResponse.json(
            { error: { code: "INTERNAL", message: "Down.", requestId: uid(996) } },
            { status: 500 },
          );
        return undefined;
      }),
    );
    renderPage(NAM_PATH);
    await screen.findByText("Chào em.");
    const stream = document.querySelector<HTMLElement>("[data-slot=message-stream]")!;
    Object.defineProperty(stream, "scrollHeight", {
      configurable: true,
      get: () => stream.querySelectorAll("[data-slot=message-bubble]").length * 200,
    });
    Object.defineProperty(stream, "clientHeight", {
      configurable: true,
      get: () => 300,
    });
    stream.scrollTop = 0;
    fireEvent.scroll(stream);

    await userEvent.click(screen.getByRole("button", { name: "Xem tin nhắn cũ hơn" }));
    expect(
      await screen.findByText("Chưa tải được tin nhắn cũ hơn. Hãy thử lại."),
    ).toBeInTheDocument();

    stream.scrollTop = 100;
    fireEvent.scroll(stream);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Nhắn cho Nam…" }),
      "Em ơi{Enter}",
    );
    await screen.findByText("Em ơi");
    expect(stream.scrollTop).toBe(stream.scrollHeight);
  });
});

describe("a class channel", () => {
  it("puts a notice in the composer's place, and says why New announcement is off, without the right to announce", async () => {
    contentWidth(1000);
    useAuthStore.setState({
      user: {
        ...teacherUser,
        permissions: teacherUser.permissions.filter(
          (key) => key !== "teaching.classes.write",
        ),
      },
    });
    renderPage(`/teacher/messages/class/${C1}`);
    await screen.findByText("Chưa có thông báo nào.");
    const notice = screen
      .getAllByText("Bạn chưa có quyền đăng thông báo tới lớp.")
      .map((node) => node.closest("[role=status]"))
      .find((node) => node !== null);
    expect(notice).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
    const button = screen.getByRole("button", { name: "Thông báo mới" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(
      "Bạn chưa có quyền đăng thông báo tới lớp.",
    );
    expect(button).toHaveAttribute(
      "title",
      "Bạn chưa có quyền đăng thông báo tới lớp.",
    );
  });

  it("draws announcements with Seen by and never sends on Enter", async () => {
    contentWidth(1000);
    state.threads = [channel(C1, "IELTS 6.5 Evening")];
    server.use(
      http.get(`${BASE}/teacher/messages/classes/:id`, async () => {
        const { contractJson } = await import("@tests/support/contractResponse");
        return contractJson("/teacher/messages/classes/{classId}", "get", 200, {
          class: {
            id: C1,
            name: "IELTS 6.5 Evening",
            archived: false,
            studentCount: 24,
          },
          messages: [
            message(20, true, "Thứ Sáu lớp chuyển sang Phòng 3.", {
              seenBy: { seen: 21, of: 24 },
            }),
          ],
          nextBefore: null,
          latestId: message(20, true, "").id,
        });
      }),
    );
    renderPage(`/teacher/messages/class/${C1}`);
    expect(await screen.findByText("21/24 học viên đã xem")).toBeInTheDocument();
    expect(screen.getByText(/^Thông báo · \d\d:\d\d$/)).toBeInTheDocument();
    const box = screen.getByRole("textbox", {
      name: "Viết thông báo tới lớp IELTS 6.5 Evening…",
    });
    await userEvent.type(box, "Mai nghỉ{Enter}");
    expect(box).toHaveValue("Mai nghỉ\n");
  });
});
