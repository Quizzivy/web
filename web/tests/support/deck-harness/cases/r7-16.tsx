import { use, useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { ShareDialog } from "@/features/sharing";
import { DIRECTORY_KEY, sharesKey, type ShareTeacher } from "@/features/sharing/api";
import { TestCard } from "@/features/tests/pages/teacher/TestCard";
import type { Test } from "@/features/tests/api";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { loadSurface } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";

/** The teacher's strings, which the harness does not load by itself. */
const TEACHER = loadSurface("teacher");
import type { components } from "@/lib/api/schema";

const ME = "019535d9-3df7-79fb-b466-fa907fa17fa0";
const TEST_ID = "018f0000-0000-7000-8000-0000000000a1";

function teacher(
  n: number,
  fullName: string,
  email: string,
  disabled = false,
): ShareTeacher {
  return {
    id: `018f0000-0000-7000-8000-00000000010${n}`,
    fullName,
    displayName: fullName,
    email,
    avatarUrl: null,
    disabled,
  };
}

/** The deck's SHARE_T, its last colleague disabled. */
const DUC = teacher(1, "Phan Minh Đức", "duc.phan@quizzivy.com");
const TRANG = teacher(2, "Nguyễn Thu Trang", "trang.nguyen@quizzivy.com");
const YEN = teacher(3, "Đỗ Hải Yến", "yen.do@quizzivy.com");
const KHOA = teacher(4, "Vũ Minh Khoa", "khoa.vu@quizzivy.com");
const VAN = teacher(5, "Lý Thanh Vân", "van.ly@quizzivy.com", true);

function grant(n: number, grantee: ShareTeacher, access: "use" | "edit") {
  return {
    id: `018f0000-0000-7000-8000-00000000020${n}`,
    grantee,
    access,
    grantedAt: "2026-11-01T00:00:00Z",
    grantedBy: { id: ME, name: "Giàu Bùi" },
  };
}

function signIn() {
  useAuthStore.setState({
    accessToken: "harness",
    user: {
      id: ME,
      email: "giau.bui@quizzivy.com",
      fullName: "Giàu Bùi",
      permissions: ["content.share"],
      workspaces: ["teacher"],
    } as unknown as components["schemas"]["CurrentUser"],
  });
}

const never = () => {};
/** hang is a fetch that never answers, for the loading state. */
const hang = () => new Promise<Response>(never);
/** offline is a fetch that fails, for the error state. */
const offline = () => Promise.reject(new TypeError("offline"));

type Seed = { grants?: ReturnType<typeof grant>[]; fetch?: "hang" | "fail" };

/** Dialog mounts the share dialog on a query cache seeded as the deck's fixtures (SHARE_0). */
function dialog({ grants, fetch }: Seed): () => ReactElement {
  return function ShareCase() {
    use(TEACHER);
    const [client] = useState(() => {
      signIn();
      if (fetch === "hang") window.fetch = hang;
      if (fetch === "fail") window.fetch = offline;
      const seeded = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      if (grants !== undefined)
        seeded.setQueryData(sharesKey("test", TEST_ID), {
          owner: {
            id: ME,
            name: "Giàu Bùi",
            email: "giau.bui@quizzivy.com",
            avatarUrl: null,
          },
          grants,
        });
      for (const [term, teachers] of [
        ["minh", [DUC, KHOA]],
        ["v", [KHOA, VAN]],
        ["trang", [TRANG]],
        ["zz", []],
        ["n", [DUC, TRANG, YEN, KHOA, VAN]],
      ] as const)
        seeded.setQueryData([...DIRECTORY_KEY, term], { teachers });
      return seeded;
    });
    const [open, setOpen] = useState(true);
    return (
      <QueryClientProvider client={client}>
        <button type="button" onClick={() => setOpen(true)}>
          open
        </button>
        {open ? (
          <ShareDialog
            open
            onOpenChange={setOpen}
            kind="test"
            resourceId={TEST_ID}
            name="IELTS Reading Mock 03"
          />
        ) : null}
        <Toaster />
      </QueryClientProvider>
    );
  };
}

const CARD: Test = {
  id: TEST_ID,
  title: "IELTS Reading Mock 03",
  description: null,
  status: "published",
  currentVersion: 2,
  nextVersion: 3,
  totalPoints: 40,
  questionCount: 40,
  audioCount: 0,
  skills: ["reading"],
  assignments: { live: 1, scheduled: 0, closed: 2 },
  unpublishedChanges: null,
  sections: [],
  access: "owner",
  owner: { id: ME, name: "Giàu Bùi" },
  sharedWith: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-11-10T00:00:00Z",
};

function Cards() {
  const selection = useBulkSelection<Test>();
  const noop = () => {};
  return (
    <div className="grid max-w-[620px] grid-cols-[repeat(auto-fill,minmax(min(290px,100%),1fr))] gap-3">
      {[
        CARD,
        { ...CARD, id: `${TEST_ID.slice(0, -1)}2`, title: "Unit 5", sharedWith: 2 },
      ].map((test) => (
        <TestCard
          key={test.id}
          test={test}
          selection={selection}
          duplicated={false}
          duplicating={false}
          onDuplicate={noop}
          onArchive={noop}
          onRestore={noop}
          onDelete={noop}
          onShare={noop}
        />
      ))}
    </div>
  );
}

export const cases: Record<string, () => ReactElement> = {
  empty: dialog({ grants: [] }),
  people: dialog({ grants: [grant(1, DUC, "edit"), grant(2, TRANG, "use")] }),
  loading: dialog({ fetch: "hang" }),
  failed: dialog({ fetch: "fail" }),
  cards: function ShareCards() {
    use(TEACHER);
    const [router] = useState(() =>
      createMemoryRouter([{ path: "*", element: <Cards /> }]),
    );
    return <RouterProvider router={router} />;
  },
};
