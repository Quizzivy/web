import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ShareDialog } from "@/features/sharing";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import "@/lib/i18n";

type Teacher = components["schemas"]["ShareTeacher"];
type Grant = components["schemas"]["ShareGrant"];
type ShareList = components["schemas"]["ShareList"];
type ShareCreate = components["schemas"]["ShareCreate"];

export const BASE = "http://localhost:8080";
export const TEST_ID = "018f0000-0000-7000-8000-0000000000a1";

function teacher(
  n: number,
  fullName: string,
  email: string,
  disabled = false,
): Teacher {
  return {
    id: `018f0000-0000-7000-8000-00000000010${n}`,
    fullName,
    displayName: fullName,
    email,
    avatarUrl: null,
    disabled,
  };
}

/** The deck's colleagues (SHARE_T), the last one disabled. */
export const DUC = teacher(1, "Phan Minh Đức", "duc.phan@example.com");
export const TRANG = teacher(2, "Nguyễn Thu Trang", "trang.nguyen@example.com");
export const YEN = teacher(3, "Đỗ Hải Yến", "yen.do@example.com");
export const KHOA = teacher(4, "Vũ Minh Khoa", "khoa.vu@example.com");
export const VAN = teacher(5, "Lý Thanh Vân", "van.ly@example.com", true);
export const DIRECTORY = [DUC, TRANG, YEN, KHOA, VAN];

export function grant(n: number, grantee: Teacher, access: "use" | "edit"): Grant {
  return {
    id: `018f0000-0000-7000-8000-00000000020${n}`,
    grantee,
    access,
    grantedAt: "2026-11-01T00:00:00Z",
    grantedBy: { id: teacherUser.id, name: teacherUser.fullName },
  };
}

/** The server's side of the dialog: who has access, what was asked and what came in. */
export const state = {
  grants: [] as Grant[],
  lookups: [] as string[],
  aborted: [] as string[],
  created: [] as ShareCreate[],
  updated: [] as { id: string; access: string }[],
  deleted: [] as string[],
  listStatus: 200,
  listDelay: 0,
  lookupDelay: 0,
};

/** fold matches as the directory does, accent-insensitively ("duc" finds "Đức"). */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/** serveSharing answers the five sharing operations from `state`. */
export function serveSharing() {
  state.grants = [];
  state.lookups = [];
  state.aborted = [];
  state.created = [];
  state.updated = [];
  state.deleted = [];
  state.listStatus = 200;
  state.listDelay = 0;
  state.lookupDelay = 0;
  server.use(
    http.get(`${BASE}/teacher/shares`, async () => {
      if (state.listDelay > 0)
        await new Promise((resolve) => setTimeout(resolve, state.listDelay));
      if (state.listStatus === 403)
        return contractJson("/teacher/shares", "get", 403, {
          error: {
            code: "SHARE_OWNER_ONLY",
            message: "Only the owner can share it.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          },
        });
      if (state.listStatus !== 200) return new HttpResponse(null, { status: 500 });
      const list: ShareList = {
        owner: {
          id: teacherUser.id,
          name: teacherUser.fullName,
          email: teacherUser.email,
          avatarUrl: null,
        },
        grants: state.grants,
      };
      return contractJson("/teacher/shares", "get", 200, list);
    }),
    http.get(`${BASE}/teacher/directory/teachers`, async ({ request }) => {
      const q = new URL(request.url).searchParams.get("q") ?? "";
      state.lookups.push(q);
      request.signal.addEventListener("abort", () => state.aborted.push(q));
      if (state.lookupDelay > 0)
        await new Promise((resolve) => setTimeout(resolve, state.lookupDelay));
      const teachers = DIRECTORY.filter((person) =>
        fold(`${person.fullName} ${person.email}`).includes(fold(q)),
      );
      return contractJson("/teacher/directory/teachers", "get", 200, { teachers });
    }),
    http.post(`${BASE}/teacher/shares`, async ({ request }) => {
      const body = (await request.json()) as ShareCreate;
      state.created.push(body);
      const made = body.granteeIds.map((id, index) =>
        grant(
          5 + state.grants.length + index,
          DIRECTORY.find((p) => p.id === id)!,
          body.access,
        ),
      );
      state.grants = [...state.grants, ...made];
      return contractJson("/teacher/shares", "post", 201, {
        grants: made,
        skipped: [],
      });
    }),
    http.patch(`${BASE}/teacher/shares/:id`, async ({ params, request }) => {
      const { access } = (await request.json()) as { access: "use" | "edit" };
      const id = String(params["id"]);
      state.updated.push({ id, access });
      state.grants = state.grants.map((held) =>
        held.id === id ? { ...held, access } : held,
      );
      return contractJson(
        "/teacher/shares/{shareId}",
        "patch",
        200,
        state.grants.find((held) => held.id === id),
      );
    }),
    http.delete(`${BASE}/teacher/shares/:id`, ({ params }) => {
      const id = String(params["id"]);
      state.deleted.push(id);
      state.grants = state.grants.filter((held) => held.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

/** signInAsOwner makes the fixture teacher, who owns the dialog's test, the signed-in user. */
export function signInAsOwner() {
  useAuthStore.setState({ user: teacherUser, accessToken: "token" });
}

function Harness({ onClosed }: Readonly<{ onClosed: () => void }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open ? (
        <ShareDialog
          open
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) onClosed();
          }}
          kind="test"
          resourceId={TEST_ID}
          name="Unit 5"
        />
      ) : null}
    </>
  );
}

/** openDialog renders an opener, clicks it and returns the user and the opener. */
export async function openDialog() {
  const closed = { count: 0 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness onClosed={() => closed.count++} />
      <Toaster />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const opener = document.querySelector("button")!;
  await user.click(opener);
  return { user, opener, closed, client };
}
