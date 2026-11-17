import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import TestBuilderPage from "@/features/tests/pages/teacher/TestBuilderPage";
import TestDetailPage from "@/features/tests/pages/teacher/TestDetailPage";
import { registerContentElement } from "@/layouts/shell/contentWidth";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The teacher's strings, which the harness does not load by itself. */
const TEACHER = loadSurface("teacher");

const ME = { id: "019535d9-3df7-79fb-b466-fa907fa17fa0", name: "Giàu Bùi" };
const DUC = { id: "018f0000-0000-7000-8000-000000000101", name: "Phan Minh Đức" };
const TRANG = { id: "018f0000-0000-7000-8000-000000000102", name: "Nguyễn Thu Trang" };
const TEST_ID = "018f0000-0000-7000-8000-0000000007a1";

type Access = "owner" | "edit" | "use";
type Mode = { access: Access; save?: "saved" | "stale" | "gone" };

function id(n: number, prefix = "0000000000"): string {
  return `018f0000-0000-7000-8000-${prefix}${String(n).padStart(2, "0")}`;
}

function ago(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** The proposal's outline: two sections, five questions. */
const QUESTIONS: [string, string, string[], number][] = [
  [
    "Choose the correct form: She ___ in Hanoi since 2019.",
    "single_choice",
    ["has lived", "lived", "is living", "lives"],
    1,
  ],
  [
    "Choose the verb that collocates: ___ a mistake.",
    "single_choice",
    ["do", "make", "have", "give"],
    1,
  ],
  [
    "True or False: The author supports car-free zones.",
    "true_false",
    ["True", "False"],
    1,
  ],
  ["Which word in paragraph 2 means “busy”?", "short_answer", [], 2],
  ["Summarise the passage in two sentences.", "essay", [], 4],
];

function question(n: number, access: Access) {
  const [prompt, type, options, points] = QUESTIONS[n] ?? QUESTIONS[0]!;
  return {
    id: id(n, "00000000b0"),
    type,
    level: "b1",
    skill: null,
    prompt,
    promptContent: null,
    explanationContent: null,
    media: null,
    audio: null,
    transcript: null,
    options: options.map((text, i) => ({
      id: id(n * 10 + i, "00000000c0"),
      ordinal: i + 1,
      text,
      isCorrect: i === (n === 1 ? 1 : 0),
    })),
    blanks: [],
    points,
    explanation: n === 1 ? "Ta nói “make a mistake”, không nói “do a mistake”." : null,
    sampleAnswer: null,
    tags: ["unit 7"],
    usedInTests: 2,
    usedIn: [],
    access,
    owner: access === "owner" ? ME : DUC,
    createdAt: ago(21),
    updatedAt: ago(2),
  };
}

function testOf({ access }: Mode) {
  return {
    id: TEST_ID,
    title: "Unit 7 · Reading and use of English",
    description: null,
    status: "published",
    currentVersion: 2,
    nextVersion: 3,
    totalPoints: 9,
    questionCount: 5,
    audioCount: 0,
    skills: ["reading", "grammar"],
    assignments: { live: 3, scheduled: 1, closed: 2 },
    unpublishedChanges: 2,
    access,
    owner: access === "owner" ? ME : DUC,
    sharedWith: access === "owner" ? 2 : 0,
    sections: [
      {
        id: id(1, "00000000d0"),
        ordinal: 0,
        title: "Ngữ pháp",
        instructions: null,
        questionIds: [0, 1, 2].map((n) => id(n, "00000000b0")),
      },
      {
        id: id(2, "00000000d0"),
        ordinal: 1,
        title: "Đọc hiểu",
        instructions: null,
        questionIds: [3, 4].map((n) => id(n, "00000000b0")),
      },
    ],
    createdAt: ago(30),
    updatedAt: ago(0.2),
  };
}

function version(n: number, assignmentCount: number) {
  return {
    id: id(n, "00000000f0"),
    version: n,
    totalPoints: 9,
    questionCount: 5,
    skills: ["reading"],
    audioCount: 0,
    manualCount: 1,
    assignmentCount,
    changeNote: n === 2 ? "Thêm câu đọc hiểu" : null,
    publishedAt: ago(10 - n * 3),
    publishedBy: DUC.name,
  };
}

const never = () => {};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const ERROR = {
  message: "Refused.",
  requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
};

function answerTests(
  path: string,
  method: string,
  mode: Mode,
): Promise<Response> | null {
  if (path.endsWith("/versions"))
    return json({ items: [version(2, 3), version(1, 0)] });
  if (path.endsWith("/preview"))
    return json({
      version: 2,
      questions: [0, 1, 2].map((n) => ({
        ...question(n, mode.access),
        sectionId: id(1, "00000000d0"),
      })),
    });
  if (path.includes("/diff")) return json({ from: null, to: null, changes: [] });
  if (path !== `/teacher/tests/${TEST_ID}`) return null;
  if (method === "GET") return json(testOf(mode));
  if (mode.save === "stale")
    return json(
      {
        error: {
          ...ERROR,
          code: "STALE_WRITE",
          details: { updatedBy: TRANG, updatedAt: new Date().toISOString() },
        },
      },
      409,
    );
  if (mode.save === "gone")
    return json({ error: { ...ERROR, code: "NOT_FOUND" } }, 404);
  return json({ ...testOf(mode), updatedAt: new Date().toISOString() });
}

/** serve answers the builder's and the detail's calls as `mode` says. */
function serve(mode: Mode): typeof window.fetch {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    if (path === "/public/status") return json({ maintenance: null, ai: true });
    if (path.startsWith("/teacher/questions/") && method === "GET") {
      const n = Number(path.slice(-2));
      return json(question(Number.isNaN(n) ? 0 : n, mode.access));
    }
    if (path === "/teacher/ai/usage") return new Promise<Response>(never);
    return (
      answerTests(path, method, mode) ??
      json({ error: { ...ERROR, code: "NOT_FOUND" } }, 404)
    );
  };
}

function signIn() {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: ME.id,
      email: "giau.bui@quizzivy.com",
      fullName: ME.name,
      permissions: [
        "content.tests.write",
        "content.tests.publish",
        "content.questions.write",
        "content.share",
        "ai.use",
      ],
      workspaces: ["teacher"],
    } as unknown as components["schemas"]["CurrentUser"],
  });
}

const ROUTES = [
  { path: "/teacher/tests/:id/edit", element: <TestBuilderPage /> },
  { path: "/teacher/tests/:id", element: <TestDetailPage /> },
  { path: "/teacher/shared-with-me", element: <p>Shared with me</p> },
];

/** at mounts the tests' routes at `path` on a fetch that answers as `mode`. */
function at(path: string, mode: Mode): () => ReactElement {
  return function AccessCase() {
    use(TEACHER);
    const [state] = useState(() => {
      signIn();
      window.fetch = serve(mode);
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter(ROUTES, { initialEntries: [path] }),
      };
    });
    return (
      <QueryClientProvider client={state.client}>
        {/* The shell's <main>, whose width the pages' columns follow. */}
        <div ref={registerContentElement}>
          <RouterProvider router={state.router} />
        </div>
        <Toaster />
      </QueryClientProvider>
    );
  };
}

const BUILDER = `/teacher/tests/${TEST_ID}/edit`;
const DETAIL = `/teacher/tests/${TEST_ID}`;

export const cases: Record<string, () => ReactElement> = {
  "builder-owner": at(BUILDER, { access: "owner" }),
  "builder-edit": at(BUILDER, { access: "edit" }),
  "builder-use": at(BUILDER, { access: "use" }),
  "builder-owner-stale": at(BUILDER, { access: "owner", save: "stale" }),
  "builder-edit-stale": at(BUILDER, { access: "edit", save: "stale" }),
  "builder-edit-gone": at(BUILDER, { access: "edit", save: "gone" }),
  "detail-owner": at(DETAIL, { access: "owner" }),
  "detail-edit": at(DETAIL, { access: "edit" }),
  "detail-use": at(DETAIL, { access: "use" }),
};
