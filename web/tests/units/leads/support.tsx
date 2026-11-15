import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import LeadsPage from "@/features/leads/pages/admin/LeadsPage";
import AdminLayout from "@/layouts/AdminLayout";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/stores/auth";
import { contentWidth } from "@tests/support/contentWidth";
import { adminUser } from "@tests/support/fixtures";
import { viewport } from "@tests/support/viewport";

type User = components["schemas"]["CurrentUser"];

/** TABLE is the name of the requests' table and of their card list. */
export const TABLE = "Yêu cầu tư vấn";

/**
 * renderLeads signs `who` in and renders the Consultation requests page at
 * `path` with the console's content `width`, and returns the router, the
 * query client and a user-event instance that does not wait between keys.
 * With `shell` the page is drawn inside the Admin console, whose sidebar
 * reads the count of new requests.
 */
export function renderLeads(
  path = "/admin/leads",
  { width = 1280, who = adminUser, shell = false } = {} as {
    width?: number;
    who?: User;
    shell?: boolean;
  },
) {
  useAuthStore.getState().setSession("token", who);
  if (shell) viewport(1280);
  contentWidth(width);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const page = {
    path: "leads/:id?",
    handle: {
      crumb: [{ key: "adminShell.crumb" }, { key: "adminShell.nav.leads" }],
      permission: "system.leads",
    },
    element: <LeadsPage />,
  };
  const router = createMemoryRouter(
    [
      shell
        ? { path: "/admin", element: <AdminLayout />, children: [page] }
        : { path: "/admin", children: [page] },
      { path: "/login", element: <h1>Đăng nhập</h1> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup({ delay: null }), router, client };
}

/** address is where the router stands: the path and its query. */
export function address(router: ReturnType<typeof renderLeads>["router"]): string {
  const { pathname, search } = router.state.location;
  return pathname + search;
}

/** table is the requests' table once it is drawn. */
export function table() {
  return screen.findByRole("table", { name: TABLE });
}

/** rowOf is the table row whose name holds `name`, or matches it. */
export async function rowOf(name: string | RegExp) {
  return within(await table()).findByRole("row", {
    name: typeof name === "string" ? new RegExp(name) : name,
  });
}

/** sheet is the open request's sheet. */
export function sheet() {
  return screen.findByRole("dialog");
}
