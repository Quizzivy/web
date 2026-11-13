import { describe, expect, it } from "vitest";
import { matchRoutes } from "react-router";
import type { HostKind } from "@/app/host";
import { routesFor } from "@/app/router";

const ID = "018f0000-0000-7000-8000-000000000001";

/** served reports whether a host's table has a page at `path`: a match that is not the catch-all. */
function served(kind: HostKind, path: string): boolean {
  const matches = matchRoutes(routesFor(kind), path);
  return matches !== null && matches.at(-1)?.route.path !== "*";
}

const STUDENT_PAGES = [
  "/classes",
  `/assignments/${ID}`,
  "/settings",
  "/settings/notifications",
  `/attempts/${ID}`,
  `/attempts/${ID}/result`,
  "/join",
  "/join/K7M3-P9QR",
];

const STAFF_PAGES = [
  "/teacher",
  "/teacher/tests",
  `/teacher/tests/${ID}/edit`,
  "/teacher/classes",
  "/teacher/settings/profile",
  "/admin",
  "/admin/users",
  "/admin/settings/sign-in",
  `/admin/exports/${ID}`,
];

const SHARED_PAGES = [
  "/",
  "/login",
  "/forgot-password",
  "/set-password",
  "/auth/google/callback",
  "/change-password",
  "/403",
];

/**
 * The route table of each host (§5.8). Each row fails when `routesFor` serves
 * a tree at a host it does not belong to, or drops one from the host it does.
 */
describe("the routes a host serves", () => {
  it.each(SHARED_PAGES)("%s is a page of every host", (path) => {
    expect(served("student", path)).toBe(true);
    expect(served("staff", path)).toBe(true);
    expect(served("all", path)).toBe(true);
  });

  it.each(STUDENT_PAGES)("%s is the student host's, and one host's", (path) => {
    expect(served("student", path)).toBe(true);
    expect(served("staff", path)).toBe(false);
    expect(served("all", path)).toBe(true);
  });

  it.each(STAFF_PAGES)("%s is the staff host's, and one host's", (path) => {
    expect(served("staff", path)).toBe(true);
    expect(served("student", path)).toBe(false);
    expect(served("all", path)).toBe(true);
  });

  // Fails when a student page keeps, or regains, the old prefix.
  it.each(["/app", "/app/classes", `/app/attempts/${ID}`, `/app/assignments/${ID}`])(
    "%s is a page of no host",
    (path) => {
      expect(served("student", path)).toBe(false);
      expect(served("staff", path)).toBe(false);
      expect(served("all", path)).toBe(false);
    },
  );

  // Fails when the staff host's root renders the student's home, or the
  // student host's root goes back to a redirect that knows nothing of it.
  it("answers the root with the student's home, except at the staff host", () => {
    const leaf = (kind: HostKind) => matchRoutes(routesFor(kind), "/")?.at(-1)?.route;

    expect(leaf("student")?.lazy).toBeDefined();
    expect(leaf("all")?.lazy).toBeDefined();
    expect(leaf("staff")?.lazy).toBeUndefined();
    expect(leaf("staff")?.element).toBeDefined();
  });

  // Fails when the take-test route moves under the student layout, whose tab
  // bar and top bar a student in a test must not have (§9).
  it("keeps the take-test page out of the student layout", () => {
    for (const kind of ["student", "all"] as const) {
      const matches = matchRoutes(routesFor(kind), `/attempts/${ID}`) ?? [];
      expect(matches.some((m) => (m.route.handle as { focus?: boolean })?.focus)).toBe(
        true,
      );
      const result = matchRoutes(routesFor(kind), `/attempts/${ID}/result`) ?? [];
      expect(result.some((m) => (m.route.handle as { focus?: boolean })?.focus)).toBe(
        false,
      );
    }
  });
});
