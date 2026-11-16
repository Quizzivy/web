import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteObject } from "react-router";

/**
 * T-R11.12a: each route tree's first route fetches the strings of the surface
 * it renders, and the router renders nothing of the tree before every matched
 * route's `lazy` has resolved. The Admin console is drawn in the teacher's
 * frame, with the teacher's lists and dialogs, so it loads both.
 */
const loadSurface = vi.hoisted(() => vi.fn((_surface: string) => Promise.resolve()));
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  loadSurface,
}));

const stub = vi.hoisted(() => () => ({ default: () => null }));
vi.mock("@/layouts/TeacherLayout", stub);
vi.mock("@/layouts/AdminLayout", stub);
vi.mock("@/layouts/StudentLayout", stub);
vi.mock("@/layouts/FocusLayout", stub);
vi.mock("@/features/auth/pages/LoginPage", stub);
vi.mock("@/features/auth/pages/ForgotPasswordPage", stub);
vi.mock("@/features/auth/pages/SetPasswordPage", stub);
vi.mock("@/features/auth/pages/GoogleCallbackPage", stub);
vi.mock("@/features/auth/pages/ChangePasswordPage", stub);
vi.mock("@/features/join/pages/JoinPage", stub);

const { routesFor } = await import("@/app/router");

function all(routes: RouteObject[]): RouteObject[] {
  return routes.flatMap((route) => [route, ...all(route.children ?? [])]);
}
const routes = all(routesFor("all"));
const at = (path: string) => routes.find((route) => route.path === path)!;
const first = (route: RouteObject) => route.children![0]!;

async function surfacesOf(route: RouteObject) {
  loadSurface.mockClear();
  await (route.lazy as () => Promise<unknown>)();
  return loadSurface.mock.calls.map(([surface]) => surface);
}

beforeEach(() => loadSurface.mockClear());

describe("the strings each route tree waits for", () => {
  it.each([
    "login",
    "forgot-password",
    "set-password",
    "auth/google/callback",
    "change-password",
  ])("/%s: the sign-in and password screens'", async (path) => {
    expect(await surfacesOf(at(path))).toEqual(["auth"]);
  });

  it.each(["join", "join/:code"])("/%s: the student's", async (path) => {
    expect(await surfacesOf(at(path))).toEqual(["student"]);
  });

  it("/teacher: the teacher's", async () => {
    expect(await surfacesOf(first(at("teacher")))).toEqual(["teacher"]);
  });

  it("/admin: the teacher's and the Admin's", async () => {
    expect(await surfacesOf(first(first(at("admin"))))).toEqual(["teacher", "admin"]);
  });

  it("the student's home and the take-test screen: the student's", async () => {
    const studentLayout = routes.find(
      (route) =>
        route.children?.[0]?.children?.some(
          (child) => child.path === "attempts/:attemptId/result",
        ) ?? false,
    )!;
    expect(await surfacesOf(first(studentLayout))).toEqual(["student"]);
    expect(await surfacesOf(at("attempts/:attemptId"))).toEqual(["student"]);
  });
});
