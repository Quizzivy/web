import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import { Toaster } from "@/components/ui/sonner";
import StudentMessagesPage from "@/features/messages/pages/student/StudentMessagesPage";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { server } from "@tests/support/server";
import { BASE, GUIDE, uid } from "./support";

type Schemas = components["schemas"];
export type StudentThread = Schemas["StudentThread"];
export type StudentMessage = Schemas["StudentMessage"];

export const TEACHER = uid(21, "0192");
export const C1 = uid(11, "0191");
export const ME = uid(31, "0192");

export const STUDENT_USER = {
  id: ME,
  email: "bao@example.com",
  fullName: "Nguyễn Gia Bảo",
  hasPassword: true,
  linkedProviders: [],
  mustChangePassword: false,
  createdAt: "2026-01-01T00:00:00Z",
  permissions: ["learning.take_tests" as const],
  workspaces: ["app" as const],
};

export function teacherRow(extra: Partial<StudentThread> = {}): StudentThread {
  return {
    thread: { kind: "direct", classId: null, teacherId: TEACHER },
    title: "Giàu Bùi",
    avatarUrl: null,
    classNames: ["IELTS 6.5 Evening", "IELTS Foundation A"],
    former: false,
    lastMessageAt: "2026-11-16T12:40:00Z",
    preview: { text: "Dạ em nhớ rồi ạ.", attachmentName: null, mine: true },
    unread: 0,
    ...extra,
  };
}

export function channelRow(extra: Partial<StudentThread> = {}): StudentThread {
  return {
    thread: { kind: "class", classId: C1, teacherId: null },
    title: "IELTS 6.5 Evening",
    avatarUrl: null,
    classNames: [],
    former: false,
    lastMessageAt: "2026-11-16T10:42:00Z",
    preview: { text: "Đáp án Unit 4.", attachmentName: null, mine: false },
    unread: 0,
    ...extra,
  };
}

export function studentMessage(
  n: number,
  mine: boolean,
  body: string | null,
  extra: Partial<StudentMessage> = {},
): StudentMessage {
  return {
    id: uid(n),
    sender: mine
      ? { id: ME, name: STUDENT_USER.fullName, avatarUrl: null }
      : { id: TEACHER, name: "Giàu Bùi", avatarUrl: null },
    body,
    attachment: null,
    createdAt: new Date(Date.UTC(2026, 10, 16, 13, n % 60)).toISOString(),
    mine,
    ...extra,
  };
}

/** StudentState is the server's side of a student page test: what it holds and what it was asked. */
export type StudentState = {
  threads: StudentThread[];
  messages: StudentMessage[];
  announcements: StudentMessage[];
  teacher: Schemas["StudentDirectThreadTeacher"];
  listStatus: number;
  reads: URL[];
  posts: Schemas["StudentMessagePost"][];
  postStatus: number;
  marks: string[];
  links: string[];
  unreadMessages: number;
};

export function freshStudentState(): StudentState {
  return {
    threads: [teacherRow(), channelRow()],
    messages: [
      studentMessage(10, false, "Chào Bảo, tuần này em làm bài tốt lắm."),
      studentMessage(11, false, "Từ vựng Unit 4, em ôn trước nhé.", {
        attachment: GUIDE,
      }),
      studentMessage(12, true, "Dạ em cảm ơn cô."),
    ],
    announcements: [studentMessage(20, false, "Thứ Sáu lớp chuyển sang Phòng 3.")],
    teacher: {
      id: TEACHER,
      name: "Giàu Bùi",
      avatarUrl: null,
      classNames: ["IELTS 6.5 Evening", "IELTS Foundation A"],
      former: false,
      canPost: true,
    },
    listStatus: 200,
    reads: [],
    posts: [],
    postStatus: 201,
    marks: [],
    links: [],
    unreadMessages: 0,
  };
}

/** serveStudent answers the student's messaging operations from `state`, through the contract. */
export function serveStudent(state: StudentState) {
  server.use(
    http.get(`${BASE}/me/summary`, () =>
      contractJson("/me/summary", "get", 200, {
        unreadNotifications: 0,
        unreadMessages: state.unreadMessages,
      }),
    ),
    http.get(`${BASE}/app/messages/threads`, () => {
      if (state.listStatus !== 200)
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "Down.", requestId: uid(997) } },
          { status: state.listStatus },
        );
      return contractJson("/app/messages/threads", "get", 200, {
        threads: state.threads,
      });
    }),
    http.get(`${BASE}/app/messages/teachers/:id`, ({ request }) => {
      const url = new URL(request.url);
      state.reads.push(url);
      const after = url.searchParams.get("after");
      return contractJson("/app/messages/teachers/{teacherId}", "get", 200, {
        teacher: state.teacher,
        messages: state.messages.filter((m) => after === null || m.id > after),
        nextBefore: null,
        latestId: state.messages.at(-1)?.id ?? null,
      });
    }),
    http.get(`${BASE}/app/messages/classes/:id`, ({ params }) =>
      contractJson("/app/messages/classes/{classId}", "get", 200, {
        readOnly: true,
        class: { id: String(params["id"]), name: "IELTS 6.5 Evening" },
        teacher: { id: TEACHER, name: "Giàu Bùi", avatarUrl: null },
        messages: state.announcements,
        nextBefore: null,
        latestId: state.announcements.at(-1)?.id ?? null,
      }),
    ),
    http.post(`${BASE}/app/messages/teachers/:id`, async ({ request }) => {
      const body = (await request.json()) as Schemas["StudentMessagePost"];
      state.posts.push(body);
      if (state.postStatus === 409)
        return HttpResponse.json(
          {
            error: {
              code: "MESSAGING_NOT_ALLOWED",
              message: "Not allowed.",
              requestId: uid(999),
            },
          },
          { status: 409 },
        );
      const made = studentMessage(50 + state.posts.length, true, body.body);
      state.messages.push(made);
      return contractJson("/app/messages/teachers/{teacherId}", "post", 201, made);
    }),
    http.post(`${BASE}/app/messages/teachers/:id/read`, async ({ request }) => {
      const body = (await request.json()) as { lastReadMessageId: string };
      state.marks.push(body.lastReadMessageId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${BASE}/app/messages/classes/:id/read`, async ({ request }) => {
      const body = (await request.json()) as { lastReadMessageId: string };
      state.marks.push(body.lastReadMessageId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${BASE}/app/messages/attachments/:id`, ({ params }) => {
      state.links.push(String(params["id"]));
      return contractJson("/app/messages/attachments/{id}", "get", 200, {
        url: "https://files.example.com/vocab.pdf?sig=1",
        expiresAt: "2026-11-16T13:05:00Z",
      });
    }),
  );
}

export function signInStudent() {
  useAuthStore.setState({ accessToken: "token", user: STUDENT_USER });
}

/** renderStudentPage mounts the student's Messages at `path` with the three routes of the student tree. */
export function renderStudentPage(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = <StudentMessagesPage />;
  const router = createMemoryRouter(
    [
      { path: "/messages", element },
      { path: "/messages/class/:classId", element },
      { path: "/messages/teacher/:teacherId", element },
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
