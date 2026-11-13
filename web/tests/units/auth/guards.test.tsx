import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  type RouteObject,
} from "react-router";
import { RequireSession } from "@/app/guards/RequireSession";
import { HomeRedirect } from "@/app/guards/HomeRedirect";
import { StudentArea, TeacherWorkspace } from "@/app/guards/RequireWorkspace";
import { useAuthStore } from "@/stores/auth";
import type { HostKind } from "@/app/host";
import { asHost } from "@tests/support/host";
import {
  adminUser,
  adminWhoTakesTests,
  assistantUser,
  studentUser,
  teacherUser,
} from "@tests/support/fixtures";
import "@/lib/i18n";

/** §5.4's route rules. Each one exists because of a specific failure: */

/**
 * A router with every guarded shape of one host, as `routesFor` lays them out,
 * so a test only has to pick a URL: the staff host answers the root with
 * `HomeRedirect`, and the others with the student's tree.
 */
function renderAt(path: string, kind: HostKind = "all") {
  asHost(kind);
  const staff: RouteObject[] = [
    { path: "/admin", element: <p>admin console</p> },
    {
      path: "/teacher",
      element: <TeacherWorkspace />,
      children: [
        {
          element: <Outlet />,
          children: [{ index: true, element: <p>admin home</p> }],
        },
      ],
    },
  ];
  const student: RouteObject = {
    path: "/",
    element: <StudentArea />,
    children: [
      {
        element: <Outlet />,
        children: [{ index: true, element: <p>student home</p> }],
      },
    ],
  };
  const routes: RouteObject[] = [
    ...(kind === "staff" ? [{ path: "/", element: <HomeRedirect /> }] : []),
    { path: "/login", element: <p>login page</p> },
    { path: "/change-password", element: <p>change password page</p> },
    { path: "/403", element: <p>forbidden page</p> },
    {
      element: <RequireSession />,
      children: [
        { path: "/change-password-guarded", element: <p>change password page</p> },
        ...(kind === "student" ? [] : staff),
        ...(kind === "staff" ? [] : [student]),
      ],
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.unstubAllEnvs();
});

describe("RequireSession", () => {
  it("waits while the session is still being restored", async () => {
    useAuthStore.setState({ isBootstrapping: true, user: null, accessToken: null });
    const router = renderAt("/");
    await waitFor(() => expect(router.state.initialized).toBe(true));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
    expect(screen.queryByText("student home")).not.toBeInTheDocument();
  });

  it("sends an anonymous visitor to /login with where they were going", async () => {
    useAuthStore.setState({ isBootstrapping: false, user: null, accessToken: null });
    const router = renderAt("/teacher");

    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe(
      `?next=${encodeURIComponent("/teacher")}`,
    );
  });

  // Fails when the guard carries the bare root as `next`: the student host's
  // home is the root, and "/login?next=%2F" says nothing "/login" does not.
  it.each(["student", "staff", "all"] as const)(
    "sends an anonymous visitor at the root of the %s host to /login alone",
    async (kind) => {
      useAuthStore.setState({ isBootstrapping: false, user: null, accessToken: null });
      const router = renderAt("/", kind);

      expect(await screen.findByText("login page")).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/login");
      expect(router.state.location.search).toBe("");
    },
  );

  it("forces the password change from any route", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: { ...studentUser, mustChangePassword: true },
    });
    const router = renderAt("/");

    expect(await screen.findByText("change password page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/change-password");
  });

  it("sends a session the server has just refused for a temporary password to the change", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: { ...studentUser, mustChangePassword: false },
    });
    const router = renderAt("/");
    expect(router.state.location.pathname).toBe("/");

    act(() => {
      useAuthStore.getState().requirePasswordChange();
    });

    expect(await screen.findByText("change password page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/change-password");
  });

  it("does not trap a Google-only account on the password change", () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: {
        ...studentUser,
        hasPassword: false,
        linkedProviders: ["google"],
        mustChangePassword: false,
      },
    });
    const router = renderAt("/");
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("role guards", () => {
  it("renders 403 for a student on the admin tree, rather than navigating", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: studentUser,
    });
    const router = renderAt("/teacher");
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("admin home")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/teacher");
  });

  it("lets a teacher into the admin tree", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: adminUser,
    });
    renderAt("/teacher");
    expect(await screen.findByText("admin home")).toBeInTheDocument();
  });

  it("redirects a teacher off the student tree", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: teacherUser,
    });
    const router = renderAt("/");

    expect(await screen.findByText("admin home")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/teacher");
  });

  it("redirects the Admin off the student tree to the Admin console", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: adminUser,
    });
    const router = renderAt("/");

    expect(await screen.findByText("admin console")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin");
  });

  it("lets a student into the student tree", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: studentUser,
    });
    renderAt("/");
    expect(await screen.findByText("student home")).toBeInTheDocument();
  });
});

const LANDING: Record<string, string> = {
  "/": "student home",
  "/admin": "admin console",
  "/teacher": "admin home",
  "/403": "forbidden page",
};

const nobody: typeof studentUser = { ...studentUser, permissions: [], workspaces: [] };

/**
 * What the root answers at each host (§5.8): `one` where one host serves every
 * page, `staff` at the staff host, `student` at the student host. "403" is the
 * 403 page drawn at the root itself, and "/403" the staff host's 403 route.
 */
describe.each([
  {
    who: "the Admin",
    user: adminUser,
    one: "/admin",
    staff: "/admin",
    student: "403",
    teacher: "admin home",
  },
  {
    who: "a Teacher",
    user: teacherUser,
    one: "/teacher",
    staff: "/teacher",
    student: "403",
    teacher: "admin home",
  },
  {
    who: "an Assistant",
    user: assistantUser,
    one: "/teacher",
    staff: "/teacher",
    student: "403",
    teacher: "admin home",
  },
  {
    who: "a Student",
    user: studentUser,
    one: "/",
    staff: "/403",
    student: "/",
    teacher: "403",
  },
  {
    who: "an Admin who takes tests",
    user: adminWhoTakesTests,
    one: "/",
    staff: "/admin",
    student: "/",
    teacher: "admin home",
  },
  {
    who: "a role with no workspace",
    user: nobody,
    one: "403",
    staff: "/403",
    student: "403",
    teacher: "403",
  },
])("workspace guards for $who", ({ user, one, staff, student, teacher }) => {
  function signIn() {
    useAuthStore.setState({ isBootstrapping: false, accessToken: "t", user });
  }

  function expectForbidden(router: ReturnType<typeof renderAt>, path: string) {
    return waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.queryByText("admin home")).not.toBeInTheDocument();
      expect(screen.queryByText("student home")).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
    });
  }

  it.each([
    ["all", one],
    ["staff", staff],
    ["student", student],
  ] as const)("answers the root of the %s host with %s", async (kind, landing) => {
    signIn();
    const router = renderAt("/", kind);
    if (landing === "403") {
      await expectForbidden(router, "/");
      return;
    }
    await waitFor(() => expect(router.state.location.pathname).toBe(landing));
    expect(await screen.findByText(LANDING[landing] ?? "")).toBeInTheDocument();
  });

  it(`answers /teacher with ${teacher}`, async () => {
    signIn();
    const router = renderAt("/teacher");
    if (teacher === "403") {
      await expectForbidden(router, "/teacher");
      return;
    }
    expect(await screen.findByText(teacher)).toBeInTheDocument();
  });
});

describe("signing out", () => {
  it("does not leave a ?next= pointing at the previous user's page", async () => {
    useAuthStore.setState({
      isBootstrapping: false,
      accessToken: "t",
      user: adminUser,
    });
    const router = renderAt("/teacher");
    expect(await screen.findByText("admin home")).toBeInTheDocument();

    try {
      await router.navigate("/login", { replace: true });
      useAuthStore.getState().signOut();
      await waitFor(() => {
        expect(router.state.navigation.state).toBe("idle");
        expect(router.state.location.pathname).toBe("/login");
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

      expect(router.state.location.pathname).toBe("/login");
      expect(router.state.location.search).toBe("");
    } finally {
      useAuthStore.setState({ signedOut: false });
    }
  });
});

describe("losing the session", () => {
  it("leaves a visitor on a public screen where they are", async () => {
    const routes: RouteObject[] = [
      { path: "/login", element: <p>login page</p> },
      { path: "/join/:code", element: <p>join page</p> },
      {
        element: <RequireSession />,
        children: [{ path: "/", element: <p>student home</p> }],
      },
    ];
    const router = createMemoryRouter(routes, {
      initialEntries: ["/join/K7M3P9QR"],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("join page")).toBeInTheDocument();

    // What the API client does when a session turns out not to exist.
    useAuthStore.getState().clearSession();

    expect(router.state.location.pathname).toBe("/join/K7M3P9QR");
    expect(screen.getByText("join page")).toBeInTheDocument();
  });
});
