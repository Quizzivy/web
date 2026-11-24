import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import { Toaster } from "@/components/ui/sonner";
import TeacherMessagesPage from "@/features/messages/pages/teacher/TeacherMessagesPage";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";

type Schemas = components["schemas"];
export type Thread = Schemas["StaffThread"];
export type Message = Schemas["StaffMessage"];

export const BASE = "http://localhost:8080";

/** uid is a uuidv7-shaped id whose order follows `n`. */
export function uid(n: number, head = "0193"): string {
  return `${head}0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

export const NAM = uid(1, "0192");
export const HA = uid(2, "0192");
export const THU = uid(4, "0192");
export const C1 = uid(11, "0191");

export const GUIDE: Schemas["MessageAttachment"] = {
  id: uid(901),
  filename: "Hướng dẫn thi thử.pdf",
  bytes: 1_258_291,
  mimeType: "application/pdf",
};

export function direct(id: string, title: string, extra: Partial<Thread> = {}): Thread {
  return {
    thread: { kind: "direct", classId: null, studentId: id },
    title,
    avatarUrl: null,
    classNames: ["IELTS 6.5 Evening"],
    otherClassNames: [],
    studentCount: null,
    former: false,
    candidate: false,
    disabled: false,
    lastMessageAt: "2026-11-16T13:20:00Z",
    preview: { text: "Em cảm ơn ạ!", attachmentName: null, mine: false },
    unread: 0,
    ...extra,
  };
}

export function channel(
  id: string,
  title: string,
  extra: Partial<Thread> = {},
): Thread {
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
    lastMessageAt: null,
    preview: null,
    unread: 0,
    ...extra,
  };
}

export function message(
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
      : { id: NAM, name: "Lê Hoàng Nam", avatarUrl: null, side: "student" },
    body,
    attachment: null,
    createdAt: new Date(Date.UTC(2026, 10, 16, 13, n % 60)).toISOString(),
    mine,
    ...extra,
  };
}

export function student(extra: Partial<Schemas["StaffDirectThreadPeer"]> = {}) {
  return {
    id: NAM,
    name: "Lê Hoàng Nam",
    avatarUrl: null,
    classes: [{ id: C1, name: "IELTS 6.5 Evening" }],
    otherClassNames: [],
    former: false,
    disabled: false,
    canPost: true,
    ...extra,
  };
}

/** State is the server's side of a page test: what it holds and what it was asked. */
export type State = {
  threads: Thread[];
  messages: Message[];
  nextBefore: string | null;
  peer: ReturnType<typeof student>;
  reads: URL[];
  posts: Schemas["StaffMessagePost"][];
  postStatus: number;
  postCode: string;
  marks: string[];
  older: Message[];
  events: Schemas["ContextEvent"][];
};

export function freshState(): State {
  return {
    threads: [direct(NAM, "Lê Hoàng Nam"), channel(C1, "IELTS 6.5 Evening")],
    messages: [message(10, false, "Em chào thầy cô."), message(11, true, "Chào em.")],
    nextBefore: null,
    peer: student(),
    reads: [],
    posts: [],
    postStatus: 201,
    postCode: "MESSAGING_NOT_ALLOWED",
    marks: [],
    older: [],
    events: [],
  };
}

/** serve answers the staff messaging operations from `state`, through the contract. */
export function serve(state: State) {
  server.use(
    http.get(`${BASE}/teacher/summary`, () =>
      contractJson("/teacher/summary", "get", 200, {
        liveAssignments: 0,
        answersToGrade: 0,
        unreadNotifications: 0,
        sharedWithMe: 0,
        unreadMessages: 0,
      }),
    ),
    http.get(`${BASE}/teacher/messages/threads`, () =>
      contractJson("/teacher/messages/threads", "get", 200, { threads: state.threads }),
    ),
    http.get(`${BASE}/teacher/messages/students/:id`, ({ request }) => {
      const url = new URL(request.url);
      state.reads.push(url);
      const after = url.searchParams.get("after");
      const before = url.searchParams.get("before");
      const messages =
        before !== null
          ? state.older
          : state.messages.filter((m) => after === null || m.id > after);
      return contractJson("/teacher/messages/students/{studentId}", "get", 200, {
        student: state.peer,
        messages,
        contextEvents: state.events,
        nextBefore: before !== null ? null : state.nextBefore,
        latestId: state.messages.at(-1)?.id ?? null,
      });
    }),
    http.get(`${BASE}/teacher/messages/classes/:id`, ({ params }) =>
      contractJson("/teacher/messages/classes/{classId}", "get", 200, {
        class: {
          id: String(params["id"]),
          name: "IELTS 6.5 Evening",
          archived: false,
          studentCount: 24,
        },
        messages: [],
        nextBefore: null,
        latestId: null,
      }),
    ),
    http.post(`${BASE}/teacher/messages/students/:id`, async ({ request }) => {
      const body = (await request.json()) as Schemas["StaffMessagePost"];
      state.posts.push(body);
      if (state.postStatus === 409)
        return HttpResponse.json(
          {
            error: {
              code: state.postCode,
              message: "Not allowed.",
              requestId: uid(999),
            },
          },
          { status: 409 },
        );
      if (state.postStatus >= 500)
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "Down.", requestId: uid(998) } },
          { status: state.postStatus },
        );
      const made = message(50 + state.posts.length, true, body.body ?? null, {
        attachment: body.attachmentId ? GUIDE : null,
      });
      state.messages.push(made);
      return contractJson("/teacher/messages/students/{studentId}", "post", 201, made);
    }),
    http.post(`${BASE}/teacher/messages/students/:id/read`, async ({ request }) => {
      const body = (await request.json()) as { lastReadMessageId: string };
      state.marks.push(body.lastReadMessageId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(
      `${BASE}/teacher/messages/classes/:id/read`,
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
}

export function signIn() {
  useAuthStore.setState({ accessToken: "token", user: teacherUser });
}

/** renderPage mounts Messages at `path` (with a location state, if given) with the three routes of the teacher tree. */
export function renderPage(
  path: string | Readonly<{ pathname: string; state: unknown }>,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = <TeacherMessagesPage />;
  const router = createMemoryRouter(
    [
      { path: "/teacher/messages", element },
      { path: "/teacher/messages/class/:classId", element },
      { path: "/teacher/messages/student/:studentId", element },
      { path: "/teacher/students", element: <p>students page</p> },
    ],
    { initialEntries: [path] },
  );
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...view, router, client };
}
