import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
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
type Recipient = Schemas["MessageRecipient"];

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

const MY_CLASSES = [
  "IELTS 6.5 Evening",
  "IELTS Foundation A",
  "Speaking Club Saturday",
  "TOEIC 600 Weekend",
];

/** The proposal's STUDENTS: name, their classes (the caller's first), a thread with the caller. */
const STUDENTS: readonly (readonly [string, readonly string[], boolean])[] = [
  ["Trần Minh Anh", ["IELTS 6.5 Evening"], false],
  ["Nguyễn Gia Bảo", ["IELTS Foundation A", "Kids Starters B"], false],
  ["Lâm Minh Châu", [], false],
  ["Phạm Thu Hà", ["IELTS Foundation A"], true],
  ["Đặng Quốc Huy", ["IELTS 6.5 Evening"], false],
  ["Võ Khánh Linh", ["TOEIC 600 Weekend"], false],
  ["Bùi Ngọc Mai", ["IELTS 6.5 Evening"], false],
  ["Hoàng Đức Minh", ["Kids Starters B"], false],
  ["Lê Hoàng Nam", ["IELTS 6.5 Evening", "Speaking Club Saturday"], true],
  ["Đỗ Phương Thảo", ["IELTS Foundation A"], true],
];
const idOf = (name: string) =>
  uid(100 + STUDENTS.findIndex((row) => row[0] === name), "0192");
const MINH = idOf("Hoàng Đức Minh");
const CHAU = idOf("Lâm Minh Châu");
const NAM = idOf("Lê Hoàng Nam");
const EVENING = uid(11, "0191");

function recipient([name, classes, has]: (typeof STUDENTS)[number]): Recipient {
  return {
    id: idOf(name),
    name,
    avatarUrl: null,
    classNames: classes.filter((c) => MY_CLASSES.includes(c)),
    otherClassNames: classes.filter((c) => !MY_CLASSES.includes(c)),
    roleName: null,
    roleBuiltinKey: null,
    threadExists: has,
    canPost: true,
  };
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

function direct(
  id: string,
  title: string,
  classNames: string[],
  when: string,
  said: string,
  mine: boolean,
  unread = 0,
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
    preview: { text: said, attachmentName: null, mine },
    unread,
  };
}

function channel(id: string, title: string, when: string, said: string): Thread {
  return {
    thread: { kind: "class", classId: id, studentId: null },
    title,
    avatarUrl: null,
    classNames: [],
    otherClassNames: [],
    studentCount: 24,
    former: false,
    candidate: false,
    disabled: false,
    lastMessageAt: when,
    preview: { text: said, attachmentName: null, mine: true },
    unread: 0,
  };
}

const THREADS: Thread[] = [
  direct(
    NAM,
    "Lê Hoàng Nam",
    ["IELTS 6.5 Evening"],
    at(0, "20:32"),
    "Dạ em cảm ơn ạ.",
    false,
  ),
  channel(
    EVENING,
    "IELTS 6.5 Evening",
    at(0, "17:42"),
    "Đáp án Unit 4, các em xem trước buổi thứ Năm.",
  ),
  direct(
    idOf("Phạm Thu Hà"),
    "Phạm Thu Hà",
    ["IELTS Foundation A"],
    at(0, "18:02"),
    "Em cảm ơn thầy cô nhiều ạ!",
    false,
    1,
  ),
  channel(
    uid(12, "0191"),
    "IELTS Foundation A",
    at(1, "16:40"),
    "Bài nghe Unit 4 mở đến 22:00 thứ Năm.",
  ),
  direct(
    idOf("Đỗ Phương Thảo"),
    "Đỗ Phương Thảo",
    ["IELTS Foundation A"],
    at(3, "10:22"),
    "Em cảm ơn ạ!",
    false,
  ),
];

let seq = 300;
function message(mine: boolean, body: string, when: string, who: string): Message {
  seq += 1;
  return {
    id: uid(seq),
    sender: mine
      ? { id: ME.id, name: ME.name, avatarUrl: null, side: "staff" }
      : { id: who, name: "", avatarUrl: null, side: "student" },
    body,
    attachment: null,
    createdAt: when,
    mine,
  };
}

type Mode = Readonly<{ picker?: "rows" | "hang" | "fail" }>;

const never = () => {};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function recipients(mode: Mode, url: URL): Promise<Response> {
  if (mode.picker === "hang") return new Promise<Response>(never);
  if (mode.picker === "fail") return Promise.reject(new TypeError("offline"));
  const q = fold(url.searchParams.get("q") ?? "");
  const classId = url.searchParams.get("classId");
  const rows = STUDENTS.filter(([name, classes]) => {
    if (q !== "" && !fold(name).includes(q)) return false;
    if (url.searchParams.get("mine") === "true")
      return classes.some((c) => MY_CLASSES.includes(c));
    if (url.searchParams.get("inNoClass") === "true") return classes.length === 0;
    if (classId !== null) return classes.includes("IELTS 6.5 Evening");
    return true;
  }).map(recipient);
  return json({ recipients: rows, nextCursor: null });
}

/** A student's thread: Minh (another teacher's class), Châu (in no class), else Nam. */
function studentThread(id: string): Promise<Response> {
  const minh = id === MINH;
  const chau = id === CHAU;
  let messages: Message[] = [];
  if (minh)
    messages = [
      message(
        true,
        "Chào Minh, cô là cô Giàu. Thầy Đức nhờ cô gửi em bài nghe luyện thêm cho kỳ thi Starters.",
        at(0, "16:40"),
        id,
      ),
      message(false, "Dạ em cảm ơn cô ạ!", at(0, "17:02"), id),
    ];
  if (chau)
    messages = [
      message(
        true,
        "Chào Châu, trung tâm đã nhận đăng ký của em. Tuần sau em vào lớp IELTS Foundation A nhé.",
        at(0, "16:05"),
        id,
      ),
    ];
  let name = "Lê Hoàng Nam";
  if (minh) name = "Hoàng Đức Minh";
  if (chau) name = "Lâm Minh Châu";
  return json({
    student: {
      id,
      name,
      avatarUrl: null,
      classes: minh || chau ? [] : [{ id: EVENING, name: "IELTS 6.5 Evening" }],
      otherClassNames: minh ? ["Kids Starters B"] : [],
      former: false,
      disabled: false,
      canPost: true,
    },
    messages,
    contextEvents: [],
    nextBefore: null,
    latestId: messages.at(-1)?.id ?? null,
  });
}

const CLASS_ROWS = MY_CLASSES.map((name, index) => ({
  id: index === 0 ? EVENING : uid(12 + index, "0191"),
  name,
}));

function serve(mode: Mode): typeof window.fetch {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    if (path === "/teacher/summary")
      return json({
        liveAssignments: 2,
        answersToGrade: 0,
        unreadNotifications: 0,
        sharedWithMe: 0,
        unreadMessages: 1,
      });
    if (path === "/teacher/messages/threads") return json({ threads: THREADS });
    if (path === "/teacher/messages/recipients") return recipients(mode, url);
    if (path === "/teacher/classes")
      return json({
        items: CLASS_ROWS,
        page: 1,
        pageSize: 100,
        total: CLASS_ROWS.length,
        facets: { all: 4, joinable: 0, archived: 0, students: 80 },
      });
    const studentPath = /^\/teacher\/messages\/students\/([^/]+)$/.exec(path);
    if (studentPath && method === "GET") return studentThread(studentPath[1]!);
    const classPath = /^\/teacher\/messages\/classes\/([^/]+)$/.exec(path);
    if (classPath && method === "GET")
      return json({
        class: {
          id: classPath[1],
          name: "IELTS 6.5 Evening",
          archived: false,
          studentCount: 24,
        },
        messages: [],
        nextBefore: null,
        latestId: null,
      });
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

/** Frame stands in for the teacher shell, as r7-20's does. */
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

function page(path: string, mode: Mode = {}): () => ReactElement {
  return function MessagesCase() {
    use(TEACHER);
    const [state] = useState(() => {
      signIn();
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

/** Each picker case opens on Messages; the reader (or a script) presses "Tin nhắn mới". */
export const cases: Record<string, () => ReactElement> = {
  picker: page(`/teacher/messages/student/${NAM}`),
  "picker-loading": page(`/teacher/messages/student/${NAM}`, { picker: "hang" }),
  "picker-error": page(`/teacher/messages/student/${NAM}`, { picker: "fail" }),
  "not-taught": page(`/teacher/messages/student/${MINH}`),
  "no-class": page(`/teacher/messages/student/${CHAU}`),
};
