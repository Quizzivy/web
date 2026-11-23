import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import StudentClassesPage from "@/features/classes/pages/StudentClassesPage";
import StudentMessagesPage from "@/features/messages/pages/student/StudentMessagesPage";
import StudentLayout from "@/layouts/StudentLayout";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The student's strings, which the harness does not load by itself. */
const STUDENT = loadSurface("student");

type Schemas = components["schemas"];
type Thread = Schemas["StudentThread"];
type Message = Schemas["StudentMessage"];

const ME = { id: "019535d9-3df7-79fb-b466-fa907fa17fb0", name: "Nguyễn Gia Bảo" };
const TEACHER = { id: "019535d9-3df7-79fb-b466-fa907fa17fa0", name: "Giàu Bùi" };

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

const C1 = uid(11, "0191");
const C2 = uid(12, "0191");
const CLASSES = ["IELTS 6.5 Evening", "IELTS Foundation A"];

const VOCAB: Schemas["MessageAttachment"] = {
  id: uid(901),
  filename: "Từ vựng Unit 4.pdf",
  bytes: 1_258_291,
  mimeType: "application/pdf",
};
const KEY: Schemas["MessageAttachment"] = {
  id: uid(902),
  filename: "Đáp án Unit 4.docx",
  bytes: 348_160,
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The proposal's student rows: the teacher, then the two class channels. */
function threads(mode: Mode): Thread[] {
  const former = mode.thread === "former";
  const teacher: Thread = {
    thread: { kind: "direct", classId: null, teacherId: TEACHER.id },
    title: TEACHER.name,
    avatarUrl: null,
    classNames: former ? [] : CLASSES,
    former,
    lastMessageAt: at(0, former ? "19:52" : "19:40"),
    preview: { text: "Dạ em nhớ rồi ạ.", attachmentName: null, mine: true },
    unread: mode.unread === true ? 1 : 0,
  };
  if (former) return [teacher];
  return [
    teacher,
    {
      thread: { kind: "class", classId: C1, teacherId: null },
      title: CLASSES[0]!,
      avatarUrl: null,
      classNames: [],
      former: false,
      lastMessageAt: at(0, "17:42"),
      preview: { text: "Đáp án Unit 4…", attachmentName: null, mine: false },
      unread: 0,
    },
    {
      thread: { kind: "class", classId: C2, teacherId: null },
      title: CLASSES[1]!,
      avatarUrl: null,
      classNames: [],
      former: false,
      lastMessageAt: at(1, "16:40"),
      preview: { text: "Bài nghe Unit 4…", attachmentName: null, mine: false },
      unread: 0,
    },
  ];
}

let seq = 100;
function message(
  mine: boolean,
  body: string | null,
  when: string,
  extra: Partial<Message> = {},
): Message {
  seq += 1;
  const sender = mine
    ? { id: ME.id, name: ME.name, avatarUrl: null }
    : { id: TEACHER.id, name: TEACHER.name, avatarUrl: null };
  return {
    id: uid(seq),
    sender,
    body,
    attachment: null,
    createdAt: when,
    mine,
    ...extra,
  };
}

const DIRECT: Message[] = [
  message(false, "Chào Bảo, tuần này em làm bài ngữ pháp tiến bộ lắm.", at(3, "10:02")),
  message(
    false,
    "Thứ Năm làm Unit 4 em nhớ mang tai nghe nhé. Bài nghe phát hai lần.",
    at(3, "10:03"),
  ),
  message(false, "Từ vựng Unit 4, em ôn trước nhé.", at(3, "10:04"), {
    attachment: VOCAB,
  }),
  message(true, "Dạ em nhớ rồi ạ. Em cảm ơn cô.", at(0, "19:40")),
];
const FORMER_TAIL: Message[] = [
  message(false, "Em vẫn ôn đều chứ? Có gì cứ nhắn cô nhé.", at(0, "19:52")),
];

const CHANNEL: Message[] = [
  message(
    false,
    "Thứ Sáu này lớp chuyển sang Phòng 3 vì trung tâm diễn tập phòng cháy.",
    at(3, "09:12"),
  ),
  message(
    false,
    "Nhắc lại: bài Reading Mock đóng lúc 21:00 tối nay. Nên làm trên laptop.",
    at(0, "17:30"),
  ),
  message(false, "Đáp án Unit 4, các em xem trước buổi thứ Năm.", at(0, "17:42"), {
    attachment: KEY,
  }),
];

type Mode = Readonly<{
  list?: "rows" | "empty" | "fail" | "hang";
  thread?: "full" | "empty" | "blocked" | "former";
  unread?: boolean;
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

function myClasses() {
  return json({
    items: CLASSES.map((name, index) => ({
      id: index === 0 ? C1 : C2,
      name,
      description: index === 0 ? "Thứ 3 và thứ 5, 19:30–21:00." : null,
      teacherId: TEACHER.id,
      teacherName: TEACHER.name,
      teacherAvatarUrl: null,
      scheduleLabel: null,
      room: null,
      schedule: { slots: [], label: null },
      joinedAt: "2026-09-01T00:00:00Z",
    })),
  });
}

function threadList(mode: Mode) {
  if (mode.list === "hang") return new Promise<Response>(never);
  if (mode.list === "fail") return Promise.reject(new TypeError("offline"));
  return json({ threads: mode.list === "empty" ? [] : threads(mode) });
}

function directMessages(mode: Mode): Message[] {
  if (mode.thread === "empty") return [];
  if (mode.thread === "blocked") return DIRECT.slice(0, 3);
  if (mode.thread === "former") return [...DIRECT, ...FORMER_TAIL];
  return DIRECT;
}

function teacherThread(mode: Mode) {
  const former = mode.thread === "former";
  const messages = directMessages(mode);
  return json({
    teacher: {
      id: TEACHER.id,
      name: TEACHER.name,
      avatarUrl: null,
      classNames: former ? [] : CLASSES,
      former,
      canPost: mode.thread !== "blocked",
    },
    messages,
    nextBefore: null,
    latestId: messages.at(-1)?.id ?? null,
  });
}

function classThread(id: string, mode: Mode) {
  const full = id === C1 && mode.thread !== "empty";
  return json({
    readOnly: true,
    class: { id, name: id === C1 ? CLASSES[0] : CLASSES[1] },
    teacher: { id: TEACHER.id, name: TEACHER.name, avatarUrl: null },
    messages: full ? CHANNEL : [],
    nextBefore: null,
    latestId: full ? CHANNEL.at(-1)!.id : null,
  });
}

/** serve answers the shell's and the page's calls from the proposal's fixtures, as `mode` says. */
function serve(mode: Mode): typeof window.fetch {
  const fixed: Record<string, () => Promise<Response>> = {
    "/me/summary": () =>
      json({ unreadNotifications: 0, unreadMessages: mode.unread ? 1 : 0 }),
    "/app/assignments": () => json({ dueNow: [], upcoming: [], completed: [] }),
    "/app/classes": myClasses,
    "/app/messages/threads": () => threadList(mode),
  };
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const answer = fixed[path];
    if (answer !== undefined) return answer();
    if (method === "POST" && path.endsWith("/read"))
      return Promise.resolve(new Response(null, { status: 204 }));
    if (/^\/app\/messages\/teachers\/[^/]+$/.test(path)) return teacherThread(mode);
    const classPath = /^\/app\/messages\/classes\/([^/]+)$/.exec(path);
    if (classPath) return classThread(classPath[1]!, mode);
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

function signIn() {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: ME.id,
      email: "giabao.ng@gmail.com",
      fullName: ME.name,
      hasPassword: true,
      linkedProviders: [],
      mustChangePassword: false,
      createdAt: "2026-01-01T00:00:00Z",
      permissions: ["learning.take_tests"],
      workspaces: ["app"],
    } as unknown as Schemas["CurrentUser"],
  });
}

const DETAIL = { detail: { titleKey: "messages.title", back: "/" } };

/**
 * page mounts the real student shell at `path`, with Messages and Classes
 * under it, on a fetch that answers as `mode`: the shell's own top bar, its
 * Messages button and its widths are the product's.
 */
function page(path: string, mode: Mode = {}): () => ReactElement {
  return function MessagesCase() {
    use(STUDENT);
    const [state] = useState(() => {
      signIn();
      window.fetch = serve({ unread: true, ...mode });
      const messages = <StudentMessagesPage />;
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter(
          [
            {
              element: <StudentLayout />,
              children: [
                { index: true, element: <p>Trang chủ</p> },
                { path: "classes", element: <StudentClassesPage /> },
                { path: "messages", handle: DETAIL, element: messages },
                { path: "messages/class/:classId", handle: DETAIL, element: messages },
                {
                  path: "messages/teacher/:teacherId",
                  handle: DETAIL,
                  element: messages,
                },
              ],
            },
          ],
          { initialEntries: [path] },
        ),
      };
    });
    return (
      <QueryClientProvider client={state.client}>
        <div className="fixed inset-0 z-10">
          <RouterProvider router={state.router} />
        </div>
        <Toaster />
      </QueryClientProvider>
    );
  };
}

const TEACHER_PATH = `/messages/teacher/${TEACHER.id}`;

export const cases: Record<string, () => ReactElement> = {
  list: page("/messages", { unread: true }),
  direct: page(TEACHER_PATH, { unread: false }),
  channel: page(`/messages/class/${C1}`),
  empty: page("/messages", { list: "empty", unread: false }),
  error: page("/messages", { list: "fail" }),
  loading: page("/messages", { list: "hang" }),
  blocked: page(TEACHER_PATH, { thread: "blocked", unread: false }),
  former: page(TEACHER_PATH, { thread: "former", unread: false }),
  "thread-empty": page(TEACHER_PATH, { thread: "empty", unread: false }),
  classes: page("/classes"),
};
