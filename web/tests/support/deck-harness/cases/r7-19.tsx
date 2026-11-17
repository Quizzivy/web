import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import QuestionBankPage from "@/features/question-bank/pages/teacher/QuestionBankPage";
import QuestionEditorPage from "@/features/question-bank/pages/teacher/QuestionEditorPage";
import QuestionSetPage from "@/features/question-bank/pages/teacher/QuestionSetPage";
import { registerContentElement } from "@/layouts/shell/contentWidth";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The teacher's strings, which the harness does not load by itself. */
const TEACHER = loadSurface("teacher");

const ME = { id: "019535d9-3df7-79fb-b466-fa907fa17fa0", name: "Giàu Bùi" };
const DUC = { id: "018f0000-0000-7000-8000-000000000101", name: "Phan Minh Đức" };
const TRANG = { id: "018f0000-0000-7000-8000-000000000102", name: "Nguyễn Thu Trang" };
const SET_ID = "018f0000-0000-7000-8000-0000000005e1";
const Q_ID = "018f0000-0000-7000-8000-0000000000a1";

type Access = "owner" | "edit" | "use";
type Mode = {
  sets?: "five" | "none";
  access?: Access;
  set?: "ready" | "hang" | "empty" | "fail" | "gone";
  save?: "saved" | "stale" | "fork";
  shared?: number;
};

const TYPES = {
  single: "single_choice",
  multi: "multiple_choice",
  tf: "true_false",
  fill: "fill_blank",
  short: "short_answer",
  essay: "essay",
} as const;

const AGO: Record<string, number> = {
  h5: 5 / 24,
  d2: 2,
  d3: 3,
  d4: 4,
  w1: 7,
  w2: 14,
  w3: 21,
};

type Row = [string, keyof typeof TYPES, string, number, string, string[]];

/** The proposal's BANK_Q, SET_MINE and SET_DUC. */
const BANK_Q: Row[] = [
  [
    "Choose the correct form: She ___ in Hanoi since 2019.",
    "single",
    "a2",
    4,
    "d2",
    ["grammar", "present perfect"],
  ],
  [
    "Listen and choose: where is the post office?",
    "single",
    "b1",
    2,
    "w1",
    ["listening", "map"],
  ],
  [
    "Complete the sentence with ONE word from the passage.",
    "fill",
    "b2",
    6,
    "d3",
    ["reading"],
  ],
  [
    "Which of the following are means of transport? Select all.",
    "multi",
    "a1",
    3,
    "w2",
    ["vocabulary", "travel"],
  ],
  [
    "Describe a place you visited recently. You should say…",
    "essay",
    "b1",
    1,
    "h5",
    ["speaking", "part 2"],
  ],
  [
    "True or False: The author supports car-free zones.",
    "tf",
    "b2",
    2,
    "d4",
    ["reading"],
  ],
  [
    "Write the missing word: “I look forward ___ hearing from you.”",
    "fill",
    "b1",
    5,
    "w1",
    ["grammar", "prepositions"],
  ],
  [
    "Summarise the chart in at least 150 words.",
    "essay",
    "b2",
    1,
    "w3",
    ["writing", "task 1"],
  ],
];
const SET_MINE: Row[] = [
  [
    "Choose the correct form: She ___ in Hanoi since 2019.",
    "single",
    "a2",
    4,
    "d2",
    ["grammar", "present perfect"],
  ],
  [
    "Write the missing word: “I have ___ finished my homework.”",
    "fill",
    "a2",
    2,
    "d2",
    ["present perfect"],
  ],
  [
    "Which sentences use the present perfect correctly? Select all.",
    "multi",
    "a2",
    3,
    "d3",
    ["present perfect"],
  ],
  [
    "True or False: “I have seen him yesterday” is correct.",
    "tf",
    "a2",
    1,
    "d4",
    ["present perfect", "common errors"],
  ],
  [
    "Complete: They ___ (not / visit) Hue yet.",
    "fill",
    "a2",
    2,
    "w1",
    ["present perfect"],
  ],
  [
    "Choose the best answer: How long ___ you known Lan?",
    "single",
    "a2",
    5,
    "w1",
    ["present perfect", "for / since"],
  ],
  [
    "Rewrite using “for” or “since”: I moved here in 2020.",
    "short",
    "a2",
    1,
    "w2",
    ["for / since"],
  ],
  [
    "Write five sentences about things you have never done.",
    "essay",
    "a2",
    0,
    "w3",
    ["writing"],
  ],
];
const SET_DUC: Row[] = [
  [
    "Choose the verb that collocates: ___ a decision.",
    "single",
    "b1",
    0,
    "d2",
    ["collocations", "make / do"],
  ],
  [
    "Complete the collocation: heavy ___ (weather).",
    "fill",
    "b1",
    0,
    "d2",
    ["collocations"],
  ],
  [
    "Which words collocate with “make”? Select all.",
    "multi",
    "b1",
    0,
    "d3",
    ["collocations", "make / do"],
  ],
  ["True or False: we say “do a mistake”.", "tf", "b1", 0, "d3", ["common errors"]],
  [
    "Write the missing word: “pay ___ to the instructions”.",
    "fill",
    "b1",
    0,
    "d4",
    ["collocations"],
  ],
  [
    "Choose the best answer: She ___ her best in the interview.",
    "single",
    "b1",
    0,
    "w1",
    ["make / do"],
  ],
  [
    "Give two adjectives that collocate with “rain”.",
    "short",
    "b1",
    0,
    "w1",
    ["collocations"],
  ],
  [
    "Write a short paragraph using five collocations from the list.",
    "essay",
    "b1",
    0,
    "w2",
    ["writing"],
  ],
];

const SETS: [string, number, number][] = [
  ["Present perfect · A2", 24, 2],
  ["Prepositions after verbs", 36, 0],
  ["Travel vocabulary", 40, 1],
  ["True or false · Reading B2", 18, 0],
  ["Grammar review · all levels", 498, 0],
  ["Phrasal verbs · B1", 32, 0],
  ["Listening · Part 1", 12, 0],
];

function ago(key: string): string {
  return new Date(Date.now() - (AGO[key] ?? 1) * 86_400_000).toISOString();
}

function id(n: number, prefix = "0000000000"): string {
  return `018f0000-0000-7000-8000-${prefix}${String(n).padStart(2, "0")}`;
}

function row(r: Row, n: number, access: Access, owner: typeof ME) {
  return {
    id: n === 0 ? Q_ID : id(n, "00000000b0"),
    type: TYPES[r[1]],
    level: r[2],
    skill: null,
    prompt: r[0],
    points: 1,
    tags: r[5],
    usedInTests: r[3],
    usedIn: [],
    access,
    owner,
    createdAt: ago("w3"),
    updatedAt: ago(r[4]),
  };
}

function page(items: unknown[], total: number) {
  const zero = { pre_a1: 0, a1: 356, a2: 356, b1: 488, b2: 351, c1: 89, c2: 0 };
  return {
    facets: {
      levels: zero,
      skills: {
        grammar: 402,
        vocabulary: 318,
        reading: 231,
        listening: 245,
        writing: 88,
        speaking: 0,
      },
      all: 1284,
      single_choice: 412,
      multiple_choice: 168,
      true_false: 120,
      fill_blank: 305,
      short_answer: 97,
      tfng: 0,
      matching: 0,
      essay: 88,
    },
    tags: ["grammar", "reading", "vocabulary"],
    bankTotal: total,
    items,
    page: 1,
    pageSize: 10,
    total,
  };
}

function setSize(mode: Mode): number {
  if (mode.set === "empty") return 0;
  return (mode.access ?? "owner") === "owner" ? 24 : 48;
}

function setOf(mode: Mode) {
  const access = mode.access ?? "owner";
  const mine = access === "owner";
  return {
    id: SET_ID,
    name: mine ? "Present perfect · A2" : "Collocations · B1",
    description: mine
      ? "Ôn thì hiện tại hoàn thành cho các lớp A2, dùng trước bài kiểm tra giữa khoá."
      : null,
    owner: mine ? ME : DUC,
    access,
    questionCount: setSize(mode),
    sharedWith: mine ? (mode.shared ?? 2) : 0,
    createdAt: ago("w3"),
    updatedAt: ago("d2"),
  };
}

function question(qid: string, mode: Mode) {
  const access = mode.access ?? "owner";
  return {
    id: qid,
    type: "single_choice",
    level: "b1",
    skill: "vocabulary",
    prompt: "Choose the verb that collocates: ___ a mistake.",
    promptContent: null,
    explanationContent: null,
    media: null,
    audio: null,
    transcript: null,
    options: ["do", "make", "have", "give"].map((text, n) => ({
      id: id(n, "00000000c0"),
      text,
      content: null,
      isCorrect: text === "make",
    })),
    blanks: [],
    points: 1,
    explanation: "Ta nói “make a mistake”, không nói “do a mistake”.",
    sampleAnswer: null,
    tags: ["collocations", "make / do"],
    usedInTests: 3,
    usedIn: [],
    access,
    owner: access === "owner" ? ME : DUC,
    createdAt: ago("w3"),
    updatedAt: ago("d2"),
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

const NOT_FOUND = {
  error: {
    code: "NOT_FOUND",
    message: "Not found.",
    requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
  },
};

type Call = Readonly<{ url: URL; method: string; path: string; mode: Mode }>;

function stale() {
  return json(
    {
      error: {
        code: "STALE_WRITE",
        message: "Changed.",
        requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
        details: { updatedBy: DUC, updatedAt: new Date().toISOString() },
      },
    },
    409,
  );
}

/** answerSets answers the question-set operations. */
function answerSets({ method, path, mode }: Call): Promise<Response> | null {
  if (path === "/teacher/question-sets" && method === "GET") {
    const list = mode.sets === "none" ? [] : SETS;
    return json({
      items: list.map(([name, count, shared], n) => ({
        id: n === 0 ? SET_ID : id(n, "0000000005"),
        name,
        description: null,
        questionCount: count,
        sharedWith: shared,
        updatedAt: ago("d2"),
      })),
    });
  }
  if (path === "/teacher/question-sets" && method === "POST")
    return json(
      {
        ...setOf({ ...mode, shared: 0 }),
        name: "Reported speech · B1",
        questionCount: 3,
      },
      201,
    );
  if (!path.startsWith("/teacher/question-sets/")) return null;
  if (method !== "GET") return json(setOf(mode));
  if (mode.set === "hang") return new Promise<Response>(never);
  if (mode.set === "fail") return Promise.reject(new TypeError("offline"));
  if (mode.set === "gone") return json(NOT_FOUND, 404);
  return json(setOf(mode));
}

/** answerQuestions answers the bank's list, a set's list, a question and its save. */
function answerQuestions({ url, method, path, mode }: Call): Promise<Response> | null {
  const access = mode.access ?? "owner";
  if (path === "/teacher/questions") {
    if (url.searchParams.get("setId") === null)
      return json(
        page(
          BANK_Q.map((r, n) => row(r, n, "owner", ME)),
          1284,
        ),
      );
    if (mode.set === "empty") return json(page([], 0));
    const rows = access === "owner" ? SET_MINE : SET_DUC;
    const owner = access === "owner" ? ME : DUC;
    return json(
      page(
        rows.map((r, n) => row(r, n, access, owner)),
        setSize(mode),
      ),
    );
  }
  if (!path.startsWith("/teacher/questions/")) return null;
  if (method === "GET") return json(question(path.split("/").pop() ?? Q_ID, mode));
  if (mode.save === "stale") return stale();
  const fork = mode.save === "fork" ? id(9, "00000000f0") : Q_ID;
  return json({ ...question(fork, mode), updatedAt: new Date().toISOString() });
}

function grantOf(teacher: typeof ME, access: "edit" | "use", n: number) {
  return {
    id: id(n, "0000000002"),
    grantee: {
      id: teacher.id,
      fullName: teacher.name,
      displayName: teacher.name,
      email: `${teacher.name.split(" ").pop()?.toLowerCase()}@quizzivy.com`,
      avatarUrl: null,
      disabled: false,
    },
    access,
    grantedAt: ago("w1"),
    grantedBy: ME,
  };
}

/** answerShares answers the share dialog's reads. */
function answerShares({ path, mode }: Call): Promise<Response> | null {
  if (path === "/teacher/directory/teachers") return json({ teachers: [] });
  if (path !== "/teacher/shares") return null;
  const grants =
    (mode.shared ?? 2) === 0 ? [] : [grantOf(DUC, "edit", 1), grantOf(TRANG, "use", 2)];
  return json({
    owner: {
      id: ME.id,
      name: ME.name,
      email: "giau.bui@quizzivy.com",
      avatarUrl: null,
    },
    grants,
  });
}

/** serve answers the pages' calls as `mode` says, from the proposals' fixtures. */
function serve(mode: Mode): typeof window.fetch {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const call = {
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      mode,
    };
    return (
      answerSets(call) ??
      answerQuestions(call) ??
      answerShares(call) ??
      json(NOT_FOUND, 404)
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
      permissions: ["content.tests.write", "content.questions.write", "content.share"],
      workspaces: ["teacher"],
    } as unknown as components["schemas"]["CurrentUser"],
  });
}

const ROUTES = [
  { path: "/teacher/question-bank", element: <QuestionBankPage /> },
  { path: "/teacher/question-bank/sets/:id", element: <QuestionSetPage /> },
  { path: "/teacher/question-bank/:id", element: <QuestionEditorPage /> },
];

/** at mounts the bank's routes at `path` on a fetch that answers as `mode`. */
function at(path: string, mode: Mode = {}): () => ReactElement {
  return function SetsCase() {
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
        {/* The shell's <main>, whose width the bank's columns follow. */}
        <div ref={registerContentElement}>
          <RouterProvider router={state.router} />
        </div>
        <Toaster />
      </QueryClientProvider>
    );
  };
}

const BANK = "/teacher/question-bank";
const SET = `${BANK}/sets/${SET_ID}`;
const EDITOR = `${BANK}/${Q_ID}?set=${SET_ID}`;

export const cases: Record<string, () => ReactElement> = {
  bank: at(BANK),
  "bank-no-sets": at(BANK, { sets: "none" }),
  "set-owner": at(SET),
  "set-owner-fresh": at(SET, { shared: 0 }),
  "set-edit": at(SET, { access: "edit" }),
  "set-use": at(SET, { access: "use" }),
  "set-loading": at(SET, { set: "hang" }),
  "set-empty": at(SET, { set: "empty" }),
  "set-error": at(SET, { set: "fail" }),
  "set-gone": at(SET, { set: "gone", access: "use" }),
  "editor-owner": at(`${BANK}/${Q_ID}`, { save: "stale" }),
  "editor-edit": at(EDITOR, { access: "edit" }),
  "editor-edit-stale": at(EDITOR, { access: "edit", save: "stale" }),
  "editor-edit-fork": at(EDITOR, { access: "edit", save: "fork" }),
  "editor-use": at(EDITOR, { access: "use" }),
};
