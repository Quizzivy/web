import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import AdminLayout from "@/layouts/AdminLayout";
import type { TeacherHandle } from "@/layouts/shell/handle";
import { writeSidebarState } from "@/layouts/shell/sidebarState";
import type { components } from "@/lib/api/schema";
import i18n from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";
import { adminUser, studentUser } from "@tests/support/fixtures";
import { serveAdminSummary } from "@tests/support/leads";
import { viewport } from "@tests/support/viewport";
import { renderRoutes } from "../shell/support";

type User = components["schemas"]["CurrentUser"];

const OVERVIEW: TeacherHandle = {
  crumb: [{ key: "adminShell.crumb" }, { key: "adminShell.nav.overview" }],
};
const leadsOnly: User = {
  ...studentUser,
  permissions: ["system.leads"],
  workspaces: ["admin"],
};

function renderAdmin(user: User = adminUser) {
  return renderRoutes(
    "/admin",
    [
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [{ index: true, handle: OVERVIEW, element: <p>trang tổng quan</p> }],
      },
    ],
    user,
  );
}

const nav = () => screen.getByRole("navigation", { name: "Điều hướng chính" });
const badges = () => document.querySelectorAll("[data-slot='nav-count']");

beforeEach(() => {
  viewport(1280);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
  writeSidebarState("expanded");
  localStorage.clear();
  await act(() => i18n.changeLanguage("vi"));
});

describe("the Consultation requests badge", () => {
  it("counts the new requests under People, in the warning tone, and says the count to a screen reader", async () => {
    serveAdminSummary({ mustChangePassword: null, newLeads: 3 });
    renderAdmin();
    await screen.findByRole("main");

    const leads = await within(nav()).findByRole("link", {
      name: /^Yêu cầu tư vấn\s*3 yêu cầu tư vấn mới$/,
    });
    expect(leads).toHaveAttribute("href", "/admin/leads");
    expect(leads.querySelector("svg.lucide-phone-incoming")).not.toBeNull();
    expect(leads.querySelector("[data-slot='nav-count']")).toHaveClass(
      "bg-warning-soft",
      "text-warning-ink",
    );
    expect(within(leads).getByText("3")).toHaveAttribute("aria-hidden", "true");
    expect(badges()).toHaveLength(1);
    expect(
      within(nav())
        .getAllByRole("link")
        .map((link) => link.textContent)
        .slice(1, 4),
    ).toEqual(["Người dùng", "Vai trò & quyền", "Yêu cầu tư vấn33 yêu cầu tư vấn mới"]);
  });

  it.each([
    ["at zero", 0],
    ["when the count is withheld", null],
  ])("is absent %s", async (_, newLeads) => {
    const seen = serveAdminSummary({ mustChangePassword: null, newLeads });
    renderAdmin();

    await waitFor(() => expect(seen.asked).toBe(1));
    await within(nav()).findByRole("link", { name: "Yêu cầu tư vấn" });
    await act(() => Promise.resolve());
    expect(badges()).toHaveLength(0);
  });

  it("comes from the read that counts the temporary passwords, asked once for both", async () => {
    const seen = serveAdminSummary({ mustChangePassword: 4, newLeads: 2 });
    renderAdmin();

    await within(nav()).findByRole("link", {
      name: /^Yêu cầu tư vấn\s*2 yêu cầu tư vấn mới$/,
    });
    expect(
      within(nav()).getByRole("link", {
        name: /^Người dùng\s*4 người cần đổi mật khẩu$/,
      }),
    ).toBeInTheDocument();
    expect(badges()).toHaveLength(2);
    expect(seen.asked).toBe(1);
  });

  it("is asked for by a role that holds system.leads alone", async () => {
    const seen = serveAdminSummary({ mustChangePassword: null, newLeads: 5 });
    renderAdmin(leadsOnly);

    await within(nav()).findByRole("link", {
      name: /^Yêu cầu tư vấn\s*5 yêu cầu tư vấn mới$/,
    });
    expect(seen.asked).toBe(1);
    expect(
      within(nav())
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/admin", "/admin/leads"]);
  });

  it("says one request in the singular in English", async () => {
    serveAdminSummary({ mustChangePassword: null, newLeads: 1 });
    renderAdmin();
    await within(nav()).findByRole("link", {
      name: /^Yêu cầu tư vấn\s*1 yêu cầu tư vấn mới$/,
    });

    await act(() => i18n.changeLanguage("en"));

    expect(
      await screen.findByRole("link", {
        name: /^Consultation requests\s*1 new consultation request$/,
      }),
    ).toBeInTheDocument();
  });
});
