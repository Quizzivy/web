import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import type { ReactElement } from "react";
import { Toaster } from "@/components/ui/sonner";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import { bankPage, bankQuestion } from "@tests/support/questionBank";
import { server } from "@tests/support/server";
import "@/lib/i18n";

type QuestionSet = components["schemas"]["QuestionSet"];
type QuestionSetSummary = components["schemas"]["QuestionSetSummary"];

export const BASE = "http://localhost:8080";
export const SET_ID = "018f0000-0000-7000-8000-0000000005e1";
export const Q1 = "018f0000-0000-7000-8000-0000000000a1";
export const Q2 = "018f0000-0000-7000-8000-0000000000a2";
export const COPY1 = "018f0000-0000-7000-8000-0000000000c1";
export const COPY2 = "018f0000-0000-7000-8000-0000000000c2";
export const TEST_ID = "018f0000-0000-7000-8000-0000000000d1";
const SECTION_ID = "018f0000-0000-7000-8000-0000000000e1";

/** The proposal's colleague who shares "Collocations · B1". */
export const DUC = {
  id: "018f0000-0000-7000-8000-000000000101",
  name: "Phan Minh Đức",
};
export const ME = { id: teacherUser.id, name: teacherUser.fullName };

/** summary is a row of `listQuestionSets`. */
export function summary(
  n: number,
  name: string,
  questionCount: number,
  sharedWith = 0,
): QuestionSetSummary {
  return {
    id: `018f0000-0000-7000-8000-00000000050${n}`,
    name,
    description: null,
    questionCount,
    sharedWith,
    updatedAt: "2026-11-14T03:00:00Z",
  };
}

/** questionSet is a `getQuestionSet` answer: the signed-in teacher's own set unless `overrides` say whose. */
export function questionSet(overrides: Partial<QuestionSet> = {}): QuestionSet {
  return {
    id: SET_ID,
    name: "Present perfect · A2",
    description: "Ôn thì hiện tại hoàn thành cho các lớp A2.",
    owner: ME,
    access: "owner",
    questionCount: 2,
    sharedWith: 0,
    createdAt: "2026-11-01T03:00:00Z",
    updatedAt: "2026-11-14T03:00:00Z",
    ...overrides,
  };
}

/** What the server was asked, and what it answers with. */
export const sets = {
  list: [] as QuestionSetSummary[],
  set: questionSet(),
  setStatus: 200,
  members: [] as ReturnType<typeof bankQuestion>[],
  listHang: false,
  created: [] as unknown[],
  added: [] as { id: string; body: unknown }[],
  removed: [] as unknown[],
  renamed: [] as unknown[],
  deleted: [] as string[],
  copied: [] as { id: string; body: unknown }[],
  outlines: [] as unknown[],
};

function setOf(id: string): QuestionSet {
  const row = sets.list.find((item) => item.id === id);
  return row === undefined
    ? sets.set
    : questionSet({ id, name: row.name, questionCount: row.questionCount });
}

/** serveSets answers the question-set operations, the set's questions and Add to test from `sets`. */
export function serveSets() {
  sets.list = [];
  sets.set = questionSet();
  sets.setStatus = 200;
  sets.members = [
    bankQuestion({ id: Q1, prompt: "Choose the correct form: She ___ since 2019." }),
    bankQuestion({ id: Q2, prompt: "Write the missing word." }),
  ];
  sets.listHang = false;
  sets.created = [];
  sets.added = [];
  sets.removed = [];
  sets.renamed = [];
  sets.deleted = [];
  sets.copied = [];
  sets.outlines = [];
  server.use(
    http.get(`${BASE}/teacher/question-sets`, () =>
      contractJson("/teacher/question-sets", "get", 200, { items: sets.list }),
    ),
    http.post(`${BASE}/teacher/question-sets`, async ({ request }) => {
      const body = (await request.json()) as {
        name: string;
        description: string | null;
        questionIds: string[];
      };
      sets.created.push(body);
      return contractJson(
        "/teacher/question-sets",
        "post",
        201,
        questionSet({
          id: SET_ID,
          name: body.name,
          description: body.description,
          questionCount: body.questionIds.length,
        }),
      );
    }),
    http.get(`${BASE}/teacher/question-sets/:id`, ({ params }) => {
      if (sets.setStatus === 404)
        return contractJson("/teacher/question-sets/{id}", "get", 404, {
          error: {
            code: "NOT_FOUND",
            message: "Not found.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          },
        });
      if (sets.setStatus !== 200) return new HttpResponse(null, { status: 500 });
      return contractJson(
        "/teacher/question-sets/{id}",
        "get",
        200,
        setOf(String(params["id"])),
      );
    }),
    http.patch(`${BASE}/teacher/question-sets/:id`, async ({ request }) => {
      const body = (await request.json()) as {
        name: string;
        description: string | null;
      };
      sets.renamed.push(body);
      sets.set = { ...sets.set, ...body };
      return contractJson("/teacher/question-sets/{id}", "patch", 200, sets.set);
    }),
    http.delete(`${BASE}/teacher/question-sets/:id`, ({ params }) => {
      sets.deleted.push(String(params["id"]));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(
      `${BASE}/teacher/question-sets/:id/items`,
      async ({ params, request }) => {
        const body = (await request.json()) as { questionIds: string[] };
        const id = String(params["id"]);
        sets.added.push({ id, body });
        const before = setOf(id);
        return contractJson("/teacher/question-sets/{id}/items", "post", 200, {
          ...before,
          questionCount: before.questionCount + body.questionIds.length,
        });
      },
    ),
    http.post(`${BASE}/teacher/question-sets/:id/items/remove`, async ({ request }) => {
      const body = (await request.json()) as { questionIds: string[] };
      sets.removed.push(body);
      sets.members = sets.members.filter((q) => !body.questionIds.includes(q.id));
      sets.set = { ...sets.set, questionCount: sets.members.length };
      return contractJson(
        "/teacher/question-sets/{id}/items/remove",
        "post",
        200,
        sets.set,
      );
    }),
    http.post(`${BASE}/teacher/question-sets/:id/copy`, async ({ params, request }) => {
      const text = await request.text();
      const body =
        text === "" ? undefined : (JSON.parse(text) as { questionIds: string[] });
      sets.copied.push({ id: String(params["id"]), body });
      const copies = (body?.questionIds ?? []).map((_, index) =>
        index === 0 ? COPY1 : COPY2,
      );
      return contractJson("/teacher/question-sets/{id}/copy", "post", 201, {
        setId: body === undefined ? "018f0000-0000-7000-8000-0000000005f9" : null,
        questionIds: copies,
      });
    }),
    http.get(`${BASE}/teacher/questions`, async ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("setId") === null)
        return contractJson("/teacher/questions", "get", 200, bankPage([]));
      if (sets.listHang) await new Promise(() => {});
      const q = url.searchParams.get("q") ?? "";
      const items = sets.members
        .filter((item) => item.prompt.includes(q))
        .map((item) => ({ ...item, access: sets.set.access, owner: sets.set.owner }));
      return contractJson("/teacher/questions", "get", 200, bankPage(items));
    }),
    // The picker reads only these fields of a test, so they are not checked against the contract.
    http.get(`${BASE}/teacher/tests`, () =>
      HttpResponse.json({ items: [testSummary()], page: 1, pageSize: 20, total: 1 }),
    ),
    http.get(`${BASE}/teacher/tests/:id`, () => HttpResponse.json(testDetail())),
    http.patch(`${BASE}/teacher/tests/:id`, async ({ request }) => {
      sets.outlines.push(await request.json());
      return HttpResponse.json(testDetail());
    }),
  );
}

function testSummary() {
  return {
    id: TEST_ID,
    title: "Unit 4 · Review",
    description: null,
    status: "draft",
    questionCount: 0,
    totalPoints: 0,
    defaultVersion: null,
    sectionCount: 1,
    updatedAt: "2026-11-10T03:00:00Z",
    createdAt: "2026-11-01T03:00:00Z",
  };
}

function testDetail() {
  return {
    ...testSummary(),
    sections: [
      { id: SECTION_ID, title: "Part 1", instructions: null, questionIds: [] },
    ],
  };
}

export function signIn() {
  useAuthStore.setState({ user: teacherUser, accessToken: "token" });
}

export function signOut() {
  useAuthStore.setState({ user: null, accessToken: null });
}

/** renderAt renders `routes` at `path` with a query client and the toaster. */
export function renderAt(
  path: string,
  routes: readonly { path: string; element: ReactElement }[],
  state?: unknown,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([...routes], {
    initialEntries: [state === undefined ? path : { pathname: path, state }],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { router, client, user: userEvent.setup() };
}
