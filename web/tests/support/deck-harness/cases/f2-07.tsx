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
type Colleague = Schemas["ColleagueThread"];
type Attachment = Schemas["MessageAttachment"];

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

/** The proposal's colleagues: Đức and Trang teach, Thường is the admin, Vân's account is disabled. */
const DUC = { id: uid(41, "0194"), name: "Phan Minh Đức", role: "teacher" } as const;
const TRANG = {
  id: uid(42, "0194"),
  name: "Nguyễn Thu Trang",
  role: "teacher",
} as const;
const THUONG = { id: uid(43, "0194"), name: "Thường Võ", role: "admin" } as const;
const VAN = { id: uid(44, "0194"), name: "Lý Thanh Vân", role: "teacher" } as const;
type Who = typeof DUC | typeof TRANG | typeof THUONG | typeof VAN;
const ROLE = { teacher: "Giáo viên", admin: "Quản trị viên" } as const;

function colleague(
  who: Who,
  when: string | null,
  said: string | null,
  mine: boolean,
  extra: Partial<Colleague> = {},
): Colleague {
  return {
    colleagueId: who.id,
    title: who.name,
    avatarUrl: null,
    roleName: ROLE[who.role],
    roleBuiltinKey: who.role,
    candidate: false,
    disabled: who === VAN,
    lastMessageAt: when,
    preview: said === null ? null : { text: said, attachmentName: null, mine },
    unread: 0,
    ...extra,
  };
}

/** The proposal's COLL, newest first. */
const COLLEAGUES: Colleague[] = [
  colleague(
    DUC,
    at(0, "20:10"),
    "Cảm ơn chị, tuần sau em thử với lớp Kids Starters B.",
    false,
    { unread: 1 },
  ),
  colleague(
    THUONG,
    at(1, "09:12"),
    "Dạ em gửi lịch thi thử tháng 12 cho anh rồi ạ.",
    true,
  ),
  colleague(VAN, at(12, "09:52"), "Chị gửi lại em bộ đề Reading cũ nhé.", false),
];

function file(n: number, filename: string, bytes: number, word: boolean): Attachment {
  return {
    id: uid(n),
    filename,
    bytes,
    mimeType: word
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf",
  };
}
const CUE = file(951, "Thẻ gợi ý Speaking Part 2.pdf", 880_640, false);
const PLAN = file(952, "Kế hoạch nói thử tháng 12.docx", 98_304, true);
const RUBRIC = file(953, "Tiêu chí chấm Writing Task 2.docx", 122_880, true);
const SAMPLE = file(954, "Bài mẫu Task 2 band 7.pdf", 419_840, false);
const READING = file(955, "Đề Reading tháng 10.pdf", 2_202_009, false);

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

type Mode = Readonly<{
  picker?: "rows" | "hang" | "fail";
  colleagues?: "rows" | "none";
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

function recipients(mode: Mode, url: URL): Promise<Response> {
  if (mode.picker === "hang") return new Promise<Response>(never);
  if (mode.picker === "fail") return Promise.reject(new TypeError("offline"));
  const q = fold(url.searchParams.get("q") ?? "");
  if (url.searchParams.get("audience") === "colleagues")
    return json({
      recipients: [DUC, TRANG, THUONG]
        .filter((who) => q === "" || fold(who.name).includes(q))
        .map((who) => ({
          id: who.id,
          name: who.name,
          avatarUrl: null,
          classNames: [],
          otherClassNames: [],
          roleName: ROLE[who.role],
          roleBuiltinKey: who.role,
          threadExists: who !== TRANG,
          canPost: true,
        })),
      nextCursor: null,
    });
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

/** colleagues answers the colleague list: the threads, and with a search Trang, who has none. */
function colleagues(mode: Mode, url: URL): Promise<Response> {
  if (mode.colleagues === "none") return json({ threads: [] });
  const q = fold(url.searchParams.get("q") ?? "");
  if (q === "") return json({ threads: COLLEAGUES });
  const found = COLLEAGUES.filter((row) => fold(row.title).includes(q));
  const more = [DUC, TRANG, THUONG]
    .filter((who) => fold(who.name).includes(q))
    .filter((who) => !found.some((row) => row.colleagueId === who.id))
    .map((who) => colleague(who, null, null, false, { candidate: true }));
  return json({ threads: [...found, ...more] });
}

function staffSaid(
  who: Who,
  mine: boolean,
  body: string | null,
  when: string,
  attachment: Attachment | null = null,
): Message {
  seq += 1;
  return {
    id: uid(seq),
    sender: mine
      ? { id: ME.id, name: ME.name, avatarUrl: null, side: "staff" }
      : { id: who.id, name: who.name, avatarUrl: null, side: "staff" },
    body,
    attachment,
    createdAt: when,
    mine,
  };
}

/** A colleague's thread: Đức's with files both ways, Vân's (disabled), Trang's empty. */
function colleagueThread(id: string): Promise<Response> {
  const who = [DUC, TRANG, THUONG, VAN].find((x) => x.id === id) ?? DUC;
  let messages: Message[] = [];
  if (who === DUC)
    messages = [
      staffSaid(
        DUC,
        false,
        "Chị Giàu ơi, em gửi chị bộ thẻ gợi ý em dùng cho lớp tối thứ Bảy.",
        at(1, "21:05"),
        CUE,
      ),
      staffSaid(DUC, false, null, at(1, "21:06"), PLAN),
      staffSaid(
        DUC,
        true,
        "Cảm ơn em. Chị gửi lại tiêu chí chấm Writing Task 2 chị đang dùng.",
        at(0, "19:48"),
        RUBRIC,
      ),
      staffSaid(DUC, true, null, at(0, "19:49"), SAMPLE),
      staffSaid(
        DUC,
        false,
        "Cảm ơn chị, tuần sau em thử với lớp Kids Starters B.",
        at(0, "20:10"),
      ),
    ];
  if (who === VAN)
    messages = [
      staffSaid(
        VAN,
        false,
        "Chị gửi lại em bộ đề Reading cũ nhé.",
        at(12, "09:40"),
        READING,
      ),
      staffSaid(VAN, true, "Dạ em cảm ơn chị.", at(12, "09:52")),
    ];
  return json({
    colleague: {
      id: who.id,
      name: who.name,
      avatarUrl: null,
      roleName: ROLE[who.role],
      roleBuiltinKey: who.role,
      disabled: who === VAN,
      canPost: who !== VAN,
    },
    messages,
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
    if (path === "/teacher/messages/colleagues") return colleagues(mode, url);
    const colleaguePath = /^\/teacher\/messages\/colleagues\/([^/]+)$/.exec(path);
    if (colleaguePath && method === "GET") return colleagueThread(colleaguePath[1]!);
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

function page(
  path: string | Readonly<{ pathname: string; state: unknown }>,
  mode: Mode = {},
): () => ReactElement {
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
            route("/teacher/messages/colleagues/:colleagueId"),
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

/** The F2 page's colleague frames; the search and the picker are typed or pressed by the script. */
export const cases: Record<string, () => ReactElement> = {
  list: page(`/teacher/messages/student/${NAM}`),
  home: page("/teacher/messages"),
  colleagues: page({
    pathname: `/teacher/messages/colleagues/${DUC.id}`,
    state: { tab: "colleagues" },
  }),
  "colleagues-none": page(
    { pathname: "/teacher/messages", state: { tab: "colleagues" } },
    { colleagues: "none" },
  ),
  colleague: page(`/teacher/messages/colleagues/${DUC.id}`),
  "colleague-empty": page(`/teacher/messages/colleagues/${TRANG.id}`),
  "colleague-blocked": page(`/teacher/messages/colleagues/${VAN.id}`),
};
