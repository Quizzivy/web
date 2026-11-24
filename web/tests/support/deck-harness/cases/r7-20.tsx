import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { writeDraft } from "@/features/messages/drafts";
import TeacherMessagesPage from "@/features/messages/pages/teacher/TeacherMessagesPage";
import { registerContentElement } from "@/layouts/shell/contentWidth";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The teacher's strings, which the harness does not load by itself. */
const TEACHER = loadSurface("teacher");

type Schemas = components["schemas"];
type Thread = Schemas["StaffThread"];
type Message = Schemas["StaffMessage"];

const ME = { id: "019535d9-3df7-79fb-b466-fa907fa17fa0", name: "Giàu Bùi" };

function uid(n: number, head = "0193"): string {
  return `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

/** at is `hh:mm` in Hồ Chí Minh City `days` days ago. */
function at(days: number, time: string): string {
  const today = new Date(Date.now() + 7 * 3_600_000 - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return new Date(`${today}T${time}:00+07:00`).toISOString();
}

const NAM = uid(1, "0192");
const HA = uid(2, "0192");
const THAO = uid(3, "0192");
const THU = uid(4, "0192");
const TRANG = uid(5, "0192");
const C1 = uid(11, "0191");
const C2 = uid(12, "0191");
const C3 = uid(13, "0191");

const GUIDE: Schemas["MessageAttachment"] = {
  id: uid(901),
  filename: "Hướng dẫn thi thử.pdf",
  bytes: 1_258_291,
  mimeType: "application/pdf",
};
const KEY: Schemas["MessageAttachment"] = {
  id: uid(902),
  filename: "Đáp án Unit 4.docx",
  bytes: 348_160,
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function preview(
  text: string | null,
  mine: boolean,
  attachmentName: string | null = null,
) {
  return { text, attachmentName, mine };
}

function direct(
  id: string,
  title: string,
  classNames: string[],
  when: string | null,
  said: Thread["preview"],
  unread = 0,
  extra: Partial<Thread> = {},
): Thread {
  return {
    thread: { kind: "direct", classId: null, studentId: id },
    title,
    avatarUrl: null,
    classNames,
    otherClassNames: [],
    studentCount: null,
    former: false,
    candidate: false,
    disabled: false,
    lastMessageAt: when,
    preview: said,
    unread,
    ...extra,
  };
}

function channel(
  id: string,
  title: string,
  count: number,
  when: string,
  said: Thread["preview"],
): Thread {
  return {
    thread: { kind: "class", classId: id, studentId: null },
    title,
    avatarUrl: null,
    classNames: [],
    otherClassNames: [],
    studentCount: count,
    former: false,
    candidate: false,
    disabled: false,
    lastMessageAt: when,
    preview: said,
    unread: 0,
  };
}

/** The proposal's CONVS: the deck's people and classes. */
const THREADS: Thread[] = [
  direct(
    NAM,
    "Lê Hoàng Nam",
    ["IELTS 6.5 Evening"],
    at(0, "20:32"),
    preview(null, true, GUIDE.filename),
  ),
  channel(
    C1,
    "IELTS 6.5 Evening",
    24,
    at(0, "17:42"),
    preview("Đáp án Unit 4, các em xem trước buổi thứ Năm.", true),
  ),
  direct(
    HA,
    "Phạm Thu Hà",
    ["IELTS Foundation A"],
    at(0, "18:02"),
    preview("Em cảm ơn thầy cô nhiều ạ!", false),
    1,
  ),
  channel(
    C2,
    "IELTS Foundation A",
    16,
    at(1, "16:40"),
    preview("Bài nghe Unit 4 mở đến 22:00 thứ Năm.", true),
  ),
  direct(
    THAO,
    "Đỗ Phương Thảo",
    ["TOEIC 600 Weekend"],
    at(3, "10:22"),
    preview("Em cảm ơn ạ!", false),
  ),
  channel(
    C3,
    "TOEIC 600 Weekend",
    22,
    at(4, "08:00"),
    preview("Chủ nhật này lớp nghỉ, học bù chiều thứ Bảy.", true),
  ),
];

/** A search for "thu": a thread that matches, then two students with none. */
const FOUND: Thread[] = [
  THREADS[2]!,
  direct(TRANG, "Vũ Thu Trang", ["IELTS Foundation A"], null, null, 0, {
    candidate: true,
  }),
  direct(THU, "Trần Minh Thư", [], null, null, 0, { candidate: true, former: true }),
];

let seq = 100;
function message(
  side: "staff" | "student",
  body: string | null,
  when: string,
  extra: Partial<Message> = {},
): Message {
  seq += 1;
  const sender =
    side === "staff"
      ? { id: ME.id, name: ME.name, avatarUrl: null, side }
      : { id: NAM, name: "Lê Hoàng Nam", avatarUrl: null, side };
  return {
    id: uid(seq),
    sender,
    body,
    attachment: null,
    createdAt: when,
    mine: side === "staff",
    ...extra,
  };
}

const NAM_MESSAGES: Message[] = [
  message("staff", "Điểm bài từ vựng tốt lắm: 24/25!", at(3, "10:05")),
  message("student", "Em cảm ơn ạ!", at(3, "10:22")),
  message(
    "student",
    "Dạ, lúc làm bài thi thử wifi nhà em bị rớt nên hệ thống tính là em rời khỏi bài ạ.",
    at(0, "20:16"),
  ),
  message(
    "student",
    "Nhờ thầy cô xem lại lượt làm bài giúp em. Em không mở gì khác ạ.",
    at(0, "20:20"),
  ),
  message(
    "staff",
    "Đã xem rồi, không sao nhé. Lần sau em xem cách chuẩn bị ở https://example.edu.vn/thi-thu.",
    at(0, "20:31"),
  ),
  message("staff", "Hướng dẫn làm bài thi thử, em đọc trước nhé.", at(0, "20:32"), {
    attachment: GUIDE,
  }),
];

const CHANNEL_MESSAGES: Message[] = [
  message(
    "staff",
    "Thứ Sáu này lớp chuyển sang Phòng 3 vì trung tâm diễn tập phòng cháy.",
    at(3, "09:12"),
    { seenBy: { seen: 24, of: 24 } },
  ),
  message(
    "staff",
    "Nhắc lại: bài Reading Mock đóng lúc 21:00 tối nay. Nên làm trên laptop.",
    at(0, "17:30"),
    { seenBy: { seen: 21, of: 24 } },
  ),
  message("staff", "Đáp án Unit 4, các em xem trước buổi thứ Năm.", at(0, "17:42"), {
    attachment: KEY,
    seenBy: { seen: 9, of: 24 },
  }),
];

type Mode = Readonly<{
  list?: "rows" | "empty" | "fail" | "hang";
  thread?: "full" | "empty" | "blocked" | "former";
}>;

const never = () => {};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function student(id: string, mode: Mode) {
  const row = [...THREADS, ...FOUND].find((x) => x.thread.studentId === id);
  const former = mode.thread === "former" || row?.former === true;
  return {
    id,
    name: row?.title ?? "Lê Hoàng Nam",
    avatarUrl: null,
    classes: former
      ? []
      : [
          { id: C1, name: "IELTS 6.5 Evening" },
          { id: uid(14, "0191"), name: "Speaking Club Saturday" },
        ],
    otherClassNames: [],
    former,
    disabled: mode.thread === "blocked",
    canPost: mode.thread !== "blocked",
  };
}

/** threads answers the thread list, as `mode` says. */
function threads(mode: Mode, url: URL): Promise<Response> {
  if (mode.list === "hang") return new Promise<Response>(never);
  if (mode.list === "fail") return Promise.reject(new TypeError("offline"));
  if (mode.list === "empty") return json({ threads: [] });
  return json({ threads: url.searchParams.get("q") === null ? THREADS : FOUND });
}

/** studentThread answers one student's thread, full only for Nam. */
function studentThread(id: string, mode: Mode): Promise<Response> {
  const full = id === NAM && mode.thread !== "empty";
  const events = [
    {
      attemptId: uid(801),
      assignmentId: uid(802),
      title: "Mid-term Reading Mock",
      focusLost: 3,
      at: at(0, "20:14"),
    },
  ];
  return json({
    student: student(id, mode),
    messages: full ? NAM_MESSAGES : [],
    contextEvents: full ? events : [],
    nextBefore: full ? uid(100) : null,
    latestId: full ? NAM_MESSAGES.at(-1)!.id : null,
  });
}

/** classChannel answers one class's channel, full only for the first class. */
function classChannel(id: string, mode: Mode): Promise<Response> {
  const row = THREADS.find((x) => x.thread.classId === id);
  const full = id === C1 && mode.thread !== "empty";
  return json({
    class: {
      id,
      name: row?.title ?? "IELTS 6.5 Evening",
      archived: mode.thread === "blocked",
      studentCount: row?.studentCount ?? 24,
    },
    messages: full ? CHANNEL_MESSAGES : [],
    nextBefore: null,
    latestId: full ? CHANNEL_MESSAGES.at(-1)!.id : null,
  });
}

const SUMMARY = {
  liveAssignments: 2,
  answersToGrade: 0,
  unreadNotifications: 0,
  sharedWithMe: 0,
  unreadMessages: 1,
};

/** serve answers the page's calls from the proposal's fixtures, as `mode` says. */
function serve(mode: Mode): typeof window.fetch {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    if (path === "/teacher/summary") return json(SUMMARY);
    if (path === "/teacher/messages/threads") return threads(mode, url);
    const studentPath = /^\/teacher\/messages\/students\/([^/]+)$/.exec(path);
    if (studentPath && method === "GET") return studentThread(studentPath[1]!, mode);
    const classPath = /^\/teacher\/messages\/classes\/([^/]+)$/.exec(path);
    if (classPath && method === "GET") return classChannel(classPath[1]!, mode);
    if (method === "POST" && path.endsWith("/read"))
      return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

function signIn() {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: ME.id,
      email: "giau.bui@quizzivy.com",
      fullName: ME.name,
      permissions: ["workspace.teacher", "teaching.classes.write"],
      workspaces: ["teacher"],
    } as unknown as Schemas["CurrentUser"],
  });
}

/**
 * Frame stands in for the teacher shell around the page: the 248px sidebar
 * from 768px, the 56px top bar and `<main>`'s gutters, so the page meets the
 * content widths the shell gives it at each window width.
 */
function Frame({ children }: Readonly<{ children: ReactElement }>) {
  return (
    <div className="bg-bg text-fg fixed inset-0 z-10 flex text-base">
      <aside
        aria-hidden="true"
        className="bg-sidebar hidden w-62 flex-none border-r min-[768px]:block"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header aria-hidden="true" className="bg-bg h-14 flex-none border-b" />
        <main
          ref={registerContentElement}
          className="min-h-0 flex-1 overflow-y-auto px-(--page-gutter) pt-(--page-pad-top) pb-8 min-[768px]:pb-10"
        >
          <div className="mx-auto w-full max-w-(--page-max)">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** page mounts Messages at `path` on a fetch that answers as `mode`. */
function page(path: string, mode: Mode = {}, draft?: () => void): () => ReactElement {
  return function MessagesCase() {
    use(TEACHER);
    const [state] = useState(() => {
      signIn();
      draft?.();
      window.fetch = serve(mode);
      const route = (p: string) => ({ path: p, element: <TeacherMessagesPage /> });
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter(
          [
            route("/teacher/messages"),
            route("/teacher/messages/class/:classId"),
            route("/teacher/messages/student/:studentId"),
          ],
          { initialEntries: [path] },
        ),
      };
    });
    return (
      <QueryClientProvider client={state.client}>
        <Frame>
          <RouterProvider router={state.router} />
        </Frame>
        <Toaster />
      </QueryClientProvider>
    );
  };
}

const NAM_PATH = `/teacher/messages/student/${NAM}`;

export const cases: Record<string, () => ReactElement> = {
  list: page("/teacher/messages"),
  direct: page(NAM_PATH),
  channel: page(`/teacher/messages/class/${C1}`),
  staged: page(NAM_PATH, {}, () =>
    writeDraft(`direct:${NAM}`, {
      text: "Hướng dẫn làm bài thi thử, em đọc trước nhé.",
      attachment: GUIDE,
    }),
  ),
  empty: page("/teacher/messages", { list: "empty" }),
  "thread-empty": page(`/teacher/messages/student/${TRANG}`, { thread: "empty" }),
  error: page("/teacher/messages", { list: "fail" }),
  loading: page("/teacher/messages", { list: "hang" }),
  blocked: page(NAM_PATH, { thread: "blocked" }),
  archived: page(`/teacher/messages/class/${C1}`, { thread: "blocked" }),
  former: page(`/teacher/messages/student/${THU}`, { thread: "former" }),
};
