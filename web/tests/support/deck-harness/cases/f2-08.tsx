import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
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

function uid(n: number, head = "0193"): string {
  return `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

const ME = { id: uid(31, "0192"), name: "Nguyễn Gia Bảo" };
/** F2 Messaging's "student" part: a teacher who does not teach Bảo writes first. */
const DUC = { id: uid(22, "0192"), name: "Phan Minh Đức" };
const GIAU = { id: uid(21, "0192"), name: "Giàu Bùi" };
const VAN = { id: uid(23, "0192"), name: "Lý Thanh Vân" };
const C1 = uid(11, "0191");
const C2 = uid(12, "0191");
const CLASSES = ["IELTS 6.5 Evening", "IELTS Foundation A"];

/** at is `hh:mm` in Hồ Chí Minh City `days` days ago. */
function at(days: number, time: string): string {
  const today = new Date(Date.now() + 7 * 3_600_000 - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return new Date(`${today}T${time}:00+07:00`).toISOString();
}

type Mode = Readonly<{ blocked?: boolean; former?: boolean }>;

function direct(
  who: Readonly<{ id: string; name: string }>,
  classNames: string[],
  former: boolean,
  time: string,
  text: string,
  mine: boolean,
): Thread {
  return {
    thread: { kind: "direct", classId: null, teacherId: who.id },
    title: who.name,
    avatarUrl: null,
    classNames,
    former,
    lastMessageAt: at(0, time),
    preview: { text, attachmentName: null, mine },
    unread: 0,
  };
}

function channel(id: string, name: string, days: number, time: string): Thread {
  return {
    thread: { kind: "class", classId: id, teacherId: null },
    title: name,
    avatarUrl: null,
    classNames: [],
    former: false,
    lastMessageAt: at(days, time),
    preview: { text: "Đáp án Unit 4…", attachmentName: null, mine: false },
    unread: 0,
  };
}

/** The page's rows: Đức (the centre), Giàu Bùi (her classes), then the channels. */
function threads(mode: Mode): Thread[] {
  const rows = [
    mode.blocked === true
      ? direct(DUC, [], false, "18:21", "Thứ Bảy em lên sớm 15 phút…", false)
      : direct(DUC, [], false, "18:34", "Dạ em cảm ơn thầy ạ…", true),
    direct(GIAU, CLASSES, false, "19:40", "Dạ em nhớ rồi ạ.", true),
  ];
  // Not on the page: a former teacher beside the other two sub-lines.
  if (mode.former === true)
    rows.push(direct(VAN, [], true, "08:10", "Chúc em thi tốt nhé.", false));
  return [
    ...rows,
    channel(C1, CLASSES[0]!, 0, "17:42"),
    channel(C2, CLASSES[1]!, 1, "16:40"),
  ];
}

let seq = 100;
function message(mine: boolean, body: string, time: string): Message {
  seq += 1;
  return {
    id: uid(seq),
    sender: mine
      ? { id: ME.id, name: ME.name, avatarUrl: null }
      : { id: DUC.id, name: DUC.name, avatarUrl: null },
    body,
    attachment: null,
    createdAt: at(0, time),
    mine,
  };
}

function messages(mode: Mode): Message[] {
  const first = [
    message(
      false,
      "Chào Bảo, thầy là thầy Đức. Cô Giàu nhờ thầy nghe giúp phần Speaking Part 2 của em.",
      "18:20",
    ),
    message(false, "Thứ Bảy em lên sớm 15 phút, thầy nghe em nói thử nhé.", "18:21"),
  ];
  if (mode.blocked === true) return first;
  return [
    ...first,
    message(true, "Dạ em cảm ơn thầy ạ. Thứ Bảy em lên sớm ạ.", "18:34"),
  ];
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function serve(mode: Mode): typeof window.fetch {
  const fixed: Record<string, () => Promise<Response>> = {
    "/me/summary": () => json({ unreadNotifications: 0, unreadMessages: 0 }),
    "/app/assignments": () => json({ dueNow: [], upcoming: [], completed: [] }),
    "/app/classes": () => json({ items: [] }),
    "/app/messages/threads": () => json({ threads: threads(mode) }),
  };
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const answer = fixed[url.pathname];
    if (answer !== undefined) return answer();
    if (method === "POST" && url.pathname.endsWith("/read"))
      return Promise.resolve(new Response(null, { status: 204 }));
    if (url.pathname === `/app/messages/teachers/${DUC.id}`) {
      const list = messages(mode);
      return json({
        teacher: {
          id: DUC.id,
          name: DUC.name,
          avatarUrl: null,
          classNames: [],
          former: false,
          canPost: mode.blocked !== true,
        },
        messages: list,
        nextBefore: null,
        latestId: list.at(-1)?.id ?? null,
      });
    }
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

/** page mounts the real student shell and Messages at `path`, on a fetch that answers as `mode`. */
function page(path: string, mode: Mode = {}): () => ReactElement {
  return function CentreCase() {
    use(STUDENT);
    const [state] = useState(() => {
      signIn();
      window.fetch = serve(mode);
      const view = <StudentMessagesPage />;
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter(
          [
            {
              element: <StudentLayout />,
              children: [
                { index: true, element: <p>Trang chủ</p> },
                { path: "messages", handle: DETAIL, element: view },
                { path: "messages/class/:classId", handle: DETAIL, element: view },
                { path: "messages/teacher/:teacherId", handle: DETAIL, element: view },
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

const DUC_PATH = `/messages/teacher/${DUC.id}`;

export const cases: Record<string, () => ReactElement> = {
  centre: page(DUC_PATH),
  blocked: page(DUC_PATH, { blocked: true }),
  list: page("/messages"),
  "three-lines": page("/messages", { former: true }),
};
