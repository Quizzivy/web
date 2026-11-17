import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import SharedWithMePage from "@/features/sharing/pages/teacher/SharedWithMePage";
import type { SharedWithMeItem } from "@/features/sharing/api";
import { loadSurface } from "@/lib/i18n";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";

/** The teacher's strings, which the harness does not load by itself. */
const TEACHER = loadSurface("teacher");

const ME = "019535d9-3df7-79fb-b466-fa907fa17fa0";

function owner(n: number, name: string, disabled = false) {
  return {
    id: `018f0000-0000-7000-8000-00000000010${n}`,
    name,
    avatarUrl: null,
    disabled,
  };
}

const DUC = owner(1, "Phan Minh Đức");
const TRANG = owner(2, "Nguyễn Thu Trang");
const YEN = owner(3, "Đỗ Hải Yến");
const VAN = owner(5, "Lý Thanh Vân", true);

function item(
  n: number,
  kind: SharedWithMeItem["kind"],
  name: string,
  by: SharedWithMeItem["owner"],
  access: SharedWithMeItem["access"],
  sharedAt: string,
  questionCount: number | null = null,
): SharedWithMeItem {
  return {
    shareId: `018f0000-0000-7000-8000-00000000030${n}`,
    kind,
    resourceId: `018f0000-0000-7000-8000-00000000040${n}`,
    name,
    owner: by,
    access,
    sharedAt,
    questionCount,
  };
}

/** The proposal's ITEMS: the deck's teachers, Lý Thanh Vân's account disabled. */
const ITEMS = [
  item(
    1,
    "test",
    "IELTS Writing Task 2 · Mock set",
    DUC,
    "edit",
    "2026-09-24T03:00:00Z",
  ),
  item(2, "question_set", "Collocations", DUC, "use", "2026-09-23T03:00:00Z", 48),
  item(
    3,
    "test",
    "Kids Starters · Animals quiz",
    TRANG,
    "edit",
    "2026-09-15T03:00:00Z",
  ),
  item(4, "question_set", "Phrasal verbs · B1", VAN, "use", "2026-09-02T03:00:00Z", 32),
  item(5, "test", "TOEIC Listening · Part 3", YEN, "use", "2026-08-28T03:00:00Z"),
];

type Mode = "list" | "empty" | "noMatch" | "hang" | "fail" | "gone";

const never = () => {};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** serve answers the page's calls as `mode` says, from the proposal's fixtures. */
function serve(mode: Mode): typeof window.fetch {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.pathname === "/teacher/shared-with-me" && method === "GET") {
      if (mode === "hang") return new Promise<Response>(never);
      if (mode === "fail") return Promise.reject(new TypeError("offline"));
      const kind = url.searchParams.get("kind");
      const shown = mode === "list" || mode === "gone" ? ITEMS : [];
      const items = shown.filter((x) => kind === null || x.kind === kind);
      return json({
        page: 1,
        pageSize: Number(url.searchParams.get("limit") ?? 10),
        total: items.length,
        items,
        counts: {
          all: shown.length,
          test: shown.filter((x) => x.kind === "test").length,
          questionSet: shown.filter((x) => x.kind === "question_set").length,
        },
      });
    }
    if (method === "POST" && url.pathname.endsWith("/copy")) {
      if (mode === "gone")
        return json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Not found.",
              requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
            },
          },
          404,
        );
      return json({ setId: null, questionIds: [] }, 201);
    }
    if (method === "DELETE")
      return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

function signIn() {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: ME,
      email: "giau.bui@quizzivy.com",
      fullName: "Giàu Bùi",
      permissions: ["content.tests.write", "content.questions.write", "content.share"],
      workspaces: ["teacher"],
    } as unknown as components["schemas"]["CurrentUser"],
  });
}

/** page mounts Shared with me at `/teacher/shared-with-me{search}` on a fetch that answers as `mode`. */
function page(mode: Mode, search = ""): () => ReactElement {
  return function SharedCase() {
    use(TEACHER);
    const [state] = useState(() => {
      signIn();
      window.fetch = serve(mode);
      return {
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        router: createMemoryRouter(
          [{ path: "/teacher/shared-with-me", element: <SharedWithMePage /> }],
          { initialEntries: [`/teacher/shared-with-me${search}`] },
        ),
      };
    });
    return (
      <QueryClientProvider client={state.client}>
        <RouterProvider router={state.router} />
        <Toaster />
      </QueryClientProvider>
    );
  };
}

export const cases: Record<string, () => ReactElement> = {
  list: page("list"),
  loading: page("hang"),
  empty: page("empty"),
  "no-match": page("noMatch", "?q=speaking+part+2"),
  error: page("fail"),
  gone: page("gone"),
};
