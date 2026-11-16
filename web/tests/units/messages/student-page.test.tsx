import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notificationKeys } from "@/features/notifications/api";
import { useAuthStore } from "@/stores/auth";
import {
  installIntersectionObserver,
  scrollAllIntoView,
} from "@tests/support/intersection";
import { viewport } from "@tests/support/viewport";
import {
  C1,
  TEACHER,
  channelRow,
  freshStudentState,
  renderStudentPage,
  serveStudent,
  signInStudent,
  studentMessage,
  teacherRow,
  type StudentState,
} from "./student-support";

let state: StudentState;

beforeEach(() => {
  state = freshStudentState();
  serveStudent(state);
  signInStudent();
  installIntersectionObserver();
  viewport(1000);
});

afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.unstubAllGlobals();
});

const TEACHER_PATH = `/messages/teacher/${TEACHER}`;
const CHANNEL_PATH = `/messages/class/${C1}`;
const LIST = "Cuộc trò chuyện";
const BOX = "Nhắn cho Giàu Bùi…";

describe("the list (T-R7.21)", () => {
  it("words a teacher by the classes they teach and a channel as announcements, and marks the unread", async () => {
    state.threads = [teacherRow({ unread: 2 }), channelRow()];
    renderStudentPage(TEACHER_PATH);
    const list = await screen.findByRole("complementary", { name: LIST });
    const teacher = await within(list).findByRole("link", { name: /Giàu Bùi/ });
    expect(teacher).toHaveTextContent(
      "Giáo viên của bạn · IELTS 6.5 Evening, IELTS Foundation A",
    );
    expect(teacher).toHaveTextContent("2 tin nhắn chưa đọc");
    expect(teacher).toHaveAttribute("href", TEACHER_PATH);
    const channel = within(list).getByRole("link", { name: /^IELTS 6.5 Evening/ });
    expect(channel).toHaveTextContent("Thông báo lớp");
    expect(channel).toHaveAttribute("href", CHANNEL_PATH);
    expect(channel).not.toHaveTextContent("chưa đọc");
  });

  it("reads “Giáo viên cũ” for a teacher whose classes the student has left", async () => {
    state.threads = [teacherRow({ former: true, classNames: [] })];
    state.teacher = { ...state.teacher, former: true, classNames: [] };
    renderStudentPage(TEACHER_PATH);
    const list = await screen.findByRole("complementary", { name: LIST });
    expect(
      await within(list).findByRole("link", { name: /Giàu Bùi/ }),
    ).toHaveTextContent("Giáo viên cũ");
    expect(await screen.findByRole("region", { name: "Giàu Bùi" })).toHaveTextContent(
      "Giáo viên cũ",
    );
  });

  it("says where announcements will appear when there is nothing yet", async () => {
    state.threads = [];
    renderStudentPage("/messages");
    expect(
      await screen.findByText(
        "Chưa có tin nhắn. Thông báo của giáo viên sẽ hiện ở đây.",
      ),
    ).toBeInTheDocument();
  });

  it("shows three skeleton rows, then an error with Retry that reads again", async () => {
    state.listStatus = 500;
    renderStudentPage("/messages");
    expect(screen.getByRole("status", { name: "Đang tải…" }).children).toHaveLength(3);
    expect(await screen.findByText("Không tải được tin nhắn.")).toBeInTheDocument();
    state.listStatus = 200;
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(
      await within(screen.getByRole("complementary", { name: LIST })).findByRole(
        "link",
        { name: /Giàu Bùi/ },
      ),
    ).toBeInTheDocument();
  });

  it("draws the thread's three bubble skeletons beside the list while it first loads", async () => {
    state.listStatus = 500;
    const { container } = renderStudentPage("/messages");
    const pane = container.querySelector<HTMLElement>(
      "div.bg-sidebar[aria-hidden=true]",
    )!;
    const bubbles = pane.querySelectorAll("[data-slot=skeleton]");
    expect([...bubbles].map((bubble) => bubble.classList.contains("self-end"))).toEqual(
      [false, false, true],
    );
    await screen.findByText("Không tải được tin nhắn.");
    expect(pane.querySelectorAll("[data-slot=skeleton]")).toHaveLength(0);
  });

  it("names a thread with no row yet for Messages until its read names the teacher", async () => {
    state.threads = [];
    renderStudentPage(TEACHER_PATH);
    const pane = screen.getByRole("region", { name: "Tin nhắn" });
    expect(within(pane).getByRole("log", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(pane.querySelector("header [data-slot=skeleton]")).not.toBeNull();
    expect(await screen.findByRole("region", { name: "Giàu Bùi" })).toHaveTextContent(
      "Giáo viên của bạn · IELTS 6.5 Evening, IELTS Foundation A",
    );
    expect(screen.getByRole("log", { name: "Giàu Bùi" })).toBeInTheDocument();
  });

  it("reads the list again when the summary's unread count changes", async () => {
    let reads = 0;
    const { client } = renderStudentPage(TEACHER_PATH);
    await screen.findByText("Dạ em cảm ơn cô.");
    await waitFor(() =>
      expect(client.getQueryData(notificationKeys.summary("student"))).toBeDefined(),
    );
    const before = client.getQueryState([
      "student-messages",
      "threads",
    ])!.dataUpdateCount;
    act(() =>
      client.setQueryData(notificationKeys.summary("student"), {
        unreadNotifications: 0,
        unreadMessages: 3,
      }),
    );
    await waitFor(() => {
      reads = client.getQueryState(["student-messages", "threads"])!.dataUpdateCount;
      expect(reads).toBe(before + 1);
    });
  });
});

describe("one pane at a time below 760px (the deck's single)", () => {
  it("shows the list alone, then the thread alone with a back arrow to the list", async () => {
    viewport(375);
    const { router } = renderStudentPage("/messages");
    const list = await screen.findByRole("complementary", { name: LIST });
    expect(document.querySelector("[data-slot=message-stream]")).toBeNull();

    await userEvent.click(await within(list).findByRole("link", { name: /Giàu Bùi/ }));
    expect(await screen.findByText("Dạ em cảm ơn cô.")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: LIST })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Về danh sách" }));
    expect(router.state.location.pathname).toBe("/messages");
  });

  it("sets them side by side from 760px, opening the first conversation", async () => {
    const { router } = renderStudentPage("/messages");
    expect(await screen.findByText("Dạ em cảm ơn cô.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(TEACHER_PATH);
    expect(screen.queryByRole("button", { name: "Về danh sách" })).toBeNull();
    expect(
      within(screen.getByRole("complementary", { name: LIST })).getByRole("link", {
        name: /Giàu Bùi/,
      }),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("a teacher's thread", () => {
  it("writes text only: no attach button, and Enter sends", async () => {
    renderStudentPage(TEACHER_PATH);
    const box = await screen.findByRole("textbox", { name: BOX });
    expect(screen.queryByRole("button", { name: "Đính kèm tệp" })).toBeNull();
    await userEvent.type(box, "  Em chào cô  {Enter}");
    await waitFor(() =>
      expect(state.posts).toEqual([
        { clientId: expect.any(String) as string, body: "Em chào cô" },
      ]),
    );
    expect(await screen.findByText("Em chào cô")).toBeInTheDocument();
  });

  it("sends nothing on the Enter that ends an IME composition, and a line on Shift+Enter", async () => {
    renderStudentPage(TEACHER_PATH);
    const box = await screen.findByRole("textbox", { name: BOX });
    fireEvent.change(box, { target: { value: "Vieejt" } });
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(box).toHaveValue("Vieejt");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.posts).toEqual([]);
  });

  it("downloads a teacher's file through a five-minute link", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderStudentPage(TEACHER_PATH);
    await userEvent.click(
      await screen.findByRole("button", { name: "Tải xuống Hướng dẫn thi thử.pdf" }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://files.example.com/vocab.pdf?sig=1"),
    );
    expect(state.links).toHaveLength(1);
  });

  it("gives the composer's place to the reason when the teacher's account is disabled", async () => {
    state.postStatus = 409;
    renderStudentPage(TEACHER_PATH);
    await userEvent.type(
      await screen.findByRole("textbox", { name: BOX }),
      "Cô ơi{Enter}",
    );
    expect(
      await screen.findByText(
        "Tài khoản của Giàu Bùi đã bị vô hiệu hoá nên không nhắn được.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: BOX })).toBeNull();
    expect(screen.getByText("Dạ em cảm ơn cô.")).toBeInTheDocument();
  });

  it("says nothing can be sent when the thread's read says the teacher cannot be written to", async () => {
    state.teacher = { ...state.teacher, canPost: false };
    renderStudentPage(TEACHER_PATH);
    expect(
      await screen.findByText(
        "Tài khoản của Giàu Bùi đã bị vô hiệu hoá nên không nhắn được.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("moves the read pointer once the end is in view, and takes the count off the row", async () => {
    state.threads = [teacherRow({ unread: 2 }), channelRow()];
    renderStudentPage(TEACHER_PATH);
    await screen.findByText("Dạ em cảm ơn cô.");
    act(() => scrollAllIntoView());
    await waitFor(() => expect(state.marks).toEqual([state.messages.at(-1)!.id]), {
      timeout: 2500,
    });
    const list = screen.getByRole("complementary", { name: LIST });
    await waitFor(() =>
      expect(
        within(list).getByRole("link", { name: /Giàu Bùi/ }),
      ).not.toHaveTextContent("chưa đọc"),
    );
  });

  it("polls after the newest message every ten seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStudentPage(TEACHER_PATH);
      await screen.findByText("Dạ em cảm ơn cô.");
      expect(state.reads.at(-1)!.searchParams.get("after")).toBeNull();
      state.messages.push(studentMessage(40, false, "Nhớ mang tai nghe nhé."));
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(await screen.findByText("Nhớ mang tai nghe nhé.")).toBeInTheDocument();
      expect(state.reads.at(-1)!.searchParams.get("after")).toBe(
        state.messages.at(-2)!.id,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a class channel", () => {
  it("is read-only: no composer, and a footer that links to the teacher's thread", async () => {
    renderStudentPage(CHANNEL_PATH);
    expect(
      await screen.findByText("Thứ Sáu lớp chuyển sang Phòng 3."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Gửi" })).toBeNull();
    expect(screen.getByText(/Chỉ giáo viên đăng được ở đây\./)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nhắn riêng cho Giàu Bùi" }),
    ).toHaveAttribute("href", TEACHER_PATH);
    expect(screen.getByText(/^Thông báo · /)).toBeInTheDocument();
    expect(screen.queryByText(/học viên đã xem/)).toBeNull();
  });

  it("says “No announcements yet.” when the channel is empty", async () => {
    state.announcements = [];
    renderStudentPage(CHANNEL_PATH);
    expect(await screen.findByText("Chưa có thông báo nào.")).toBeInTheDocument();
  });
});
