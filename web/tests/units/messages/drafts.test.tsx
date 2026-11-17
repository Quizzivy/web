import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { useLogout } from "@/features/auth/useSession";
import { readDraft, writeDraft } from "@/features/messages/drafts";
import { useAuthStore } from "@/stores/auth";
import { contentWidth } from "@tests/support/contentWidth";
import { installIntersectionObserver } from "@tests/support/intersection";
import { server } from "@tests/support/server";
import {
  BASE,
  GUIDE,
  HA,
  NAM,
  direct,
  freshState,
  renderPage,
  serve,
  signIn,
} from "./support";

vi.mock("@/features/messages/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/messages/api")>()),
  uploadMessageAttachment: async () => GUIDE,
}));

vi.mock("@/lib/drafts/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/drafts/store")>()),
  clearAuthoringDrafts: async () => undefined,
}));

beforeEach(() => {
  const state = freshState();
  state.threads = [direct(NAM, "Lê Hoàng Nam"), direct(HA, "Phạm Thu Hà")];
  serve(state);
  signIn();
  installIntersectionObserver();
});

afterEach(() => {
  useAuthStore.getState().clearSession();
});

describe("a draft per thread, in memory (T-R7.20)", () => {
  it("keeps a thread's text and its waiting file while another thread is open", async () => {
    contentWidth(1000);
    const { router } = renderPage(`/teacher/messages/student/${NAM}`);
    const nam = await screen.findByRole("textbox", { name: "Nhắn cho Nam…" });
    await userEvent.type(nam, "Em xem lại bài nhé");
    await userEvent.click(screen.getByRole("button", { name: "Đính kèm tệp" }));
    const dialog = await screen.findByRole("dialog", { name: "Đính kèm tệp" });
    await userEvent.upload(
      dialog.querySelector<HTMLInputElement>("input[type=file]")!,
      new File(["%PDF-1.7"], GUIDE.filename, { type: "application/pdf" }),
    );
    const attach = await screen.findByRole("button", { name: "Đính kèm" });
    await waitFor(() => expect(attach).toBeEnabled());
    await userEvent.click(attach);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(GUIDE.filename)).toBeInTheDocument();

    const list = screen.getByRole("complementary", { name: "Cuộc trò chuyện" });
    await userEvent.click(within(list).getByRole("link", { name: /Phạm Thu Hà/ }));
    // The stand-in server names every thread's student Nam; the address says which is open.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/teacher/messages/student/${HA}`),
    );
    expect(await screen.findByRole("textbox", { name: "Nhắn cho Nam…" })).toHaveValue(
      "",
    );
    expect(screen.queryByText(GUIDE.filename)).toBeNull();

    await userEvent.click(within(list).getByRole("link", { name: /Lê Hoàng Nam/ }));
    expect(await screen.findByRole("textbox", { name: "Nhắn cho Nam…" })).toHaveValue(
      "Em xem lại bài nhé",
    );
    expect(screen.getByText(GUIDE.filename)).toBeInTheDocument();
  });

  it("forgets every draft when the user signs out", async () => {
    server.use(
      http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );
    writeDraft(`direct:${NAM}`, { text: "Chưa gửi", attachment: GUIDE });
    expect(readDraft(`direct:${NAM}`).text).toBe("Chưa gửi");
    const { result } = renderHook(() => useLogout(), {
      wrapper: ({ children }: Readonly<{ children: ReactNode }>) => (
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      ),
    });

    await act(() => result.current());

    expect(readDraft(`direct:${NAM}`)).toEqual({ text: "", attachment: null });
  });
});
