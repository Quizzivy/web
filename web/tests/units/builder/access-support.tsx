import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http } from "msw";
import TestBuilderPage from "@/features/tests/pages/teacher/TestBuilderPage";
import { Toaster } from "@/components/ui/sonner";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import "@/lib/i18n";

type Test = components["schemas"]["Test"];
type Question = components["schemas"]["AdminQuestion"];
export type Access = Test["access"];

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

export const BASE = "http://localhost:8080";
export const TEST_ID = "018f0000-0000-7000-8000-0000000007a1";
export const SECTION_ID = "018f0000-0000-7000-8000-0000000007c1";
export const Q1 = "018f0000-0000-7000-8000-0000000007b1";
export const READ_AT = "2026-11-10T03:00:00Z";
export const TEST_AT = "2026-11-10T04:00:00Z";
export const ME = { id: teacherUser.id, name: teacherUser.fullName };
/** DUC owns the shared test; TRANG is the co-editor a refused save names. */
export const DUC = {
  id: "018f0000-0000-7000-8000-000000000101",
  name: "Phan Minh Đức",
};
export const TRANG = {
  id: "018f0000-0000-7000-8000-000000000102",
  name: "Nguyễn Thu Trang",
};

/** builderTest is the draft getTest answers, owned by Đức unless the access is the caller's own. */
export function builderTest(access: Access, overrides: Partial<Test> = {}): Test {
  return {
    skills: [],
    assignments: { live: 2, scheduled: 0, closed: 0 },
    unpublishedChanges: null,
    access,
    owner: access === "owner" ? ME : DUC,
    sharedWith: 0,
    id: TEST_ID,
    title: "Unit 7 · Reading",
    description: null,
    status: "draft",
    currentVersion: 0,
    nextVersion: 1,
    totalPoints: 2,
    questionCount: 1,
    audioCount: 0,
    sections: [
      {
        id: SECTION_ID,
        ordinal: 0,
        title: "Đọc hiểu",
        instructions: null,
        questionIds: [Q1],
      },
    ],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: TEST_AT,
    ...overrides,
  };
}

/** choice is a single choice with two options, the question the draft holds. */
export function choice(id: string, overrides: Partial<Question> = {}): Question {
  const tail = id.slice(-2);
  return {
    level: null,
    skill: null,
    id,
    type: "single_choice",
    prompt: "Choose the verb that collocates: ___ a mistake.",
    media: null,
    audio: null,
    transcript: null,
    options: [
      {
        id: `018f0000-0000-7000-8000-0000000008${tail}`,
        ordinal: 1,
        text: "do",
        isCorrect: false,
      },
      {
        id: `018f0000-0000-7000-8000-0000000009${tail}`,
        ordinal: 2,
        text: "make",
        isCorrect: true,
      },
    ],
    blanks: [],
    points: 2,
    explanation: null,
    sampleAnswer: null,
    tags: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: READ_AT,
    ...overrides,
  };
}

/** sent is every write the builder sent, as "METHOD path?query". */
export const sent: string[] = [];

/**
 * recordWrites resets `sent` and records each non-GET request into it, so a
 * test can show that a mode sends nothing.
 */
export function recordWrites() {
  sent.length = 0;
  server.events.removeAllListeners();
  server.events.on("request:start", ({ request }) => {
    if (request.method === "GET") return;
    const url = new URL(request.url);
    sent.push(`${request.method} ${url.pathname}${url.search}`);
  });
}

/** serveBuilder answers the test and its question reads. */
export function serveBuilder(test: Test, questions: Question[] = [choice(Q1)]) {
  server.use(
    http.get(`${BASE}/teacher/tests/:id`, () =>
      contractJson("/teacher/tests/{id}", "get", 200, test),
    ),
    http.get(`${BASE}/teacher/questions/:id`, ({ params }) => {
      const found = questions.find((question) => question.id === params["id"]);
      return contractJson(
        "/teacher/questions/{id}",
        "get",
        200,
        found ?? choice(String(params["id"])),
      );
    }),
  );
}

export function signIn(permissions = teacherUser.permissions) {
  useAuthStore.setState({
    user: { ...teacherUser, permissions },
    accessToken: "token",
  });
}

export function signOut() {
  useAuthStore.setState({ user: null, accessToken: null });
}

/** renderBuilder mounts the builder beside stand-ins for the pages it leads to. */
export function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/teacher/tests/:id/edit", element: <TestBuilderPage /> },
      { path: "/teacher/tests/:id", element: <p>test detail</p> },
      { path: "/teacher/tests", element: <p>tests list</p> },
      { path: "/teacher/shared-with-me", element: <p>shared with me</p> },
      { path: "/teacher/assignments/new", element: <p>wizard</p> },
    ],
    { initialEntries: [`/teacher/tests/${TEST_ID}/edit`] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router, client };
}
