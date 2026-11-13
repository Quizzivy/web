import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { skeletonFor } from "@/app/boot/handoff";
import { homePathFor } from "@/features/auth/home";
import { joinLinkLabel, joinLinkOf, joinSite } from "@/features/classes/joinLink";
import "@/layouts/StudentLayout";
import "@/layouts/TeacherLayout";
import {
  adminUser,
  adminWhoTakesTests,
  studentUser,
  teacherUser,
} from "@tests/support/fixtures";
import { asHost } from "@tests/support/host";
import "@/lib/i18n";

const nobody = { ...studentUser, permissions: [], workspaces: [] };
const ATTEMPT = "018f0000-0000-7000-8000-0000000000e1";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Where a signed-in user belongs on each host (§5.8). Fails when `homePathFor`
 * forgets the host: a staff console's path at the student host, which has no
 * such page, or the student's root at the staff host, which answers it with
 * this very redirect.
 */
describe("the home of a user on each host", () => {
  it.each([
    ["a student", studentUser, "/", "/403", "/"],
    ["a teacher", teacherUser, "/", "/teacher", "/teacher"],
    ["the Admin", adminUser, "/", "/admin", "/admin"],
    ["an Admin who takes tests", adminWhoTakesTests, "/", "/admin", "/admin"],
    ["a role with no workspace", nobody, "/", "/403", "/"],
  ] as const)("sends %s home", (_, user, student, staff, one) => {
    expect(homePathFor(user, "student")).toBe(student);
    expect(homePathFor(user, "staff")).toBe(staff);
    expect(homePathFor(user, "all")).toBe(one);
  });

  it("reads the host of the page when it is given none", () => {
    asHost("student");
    expect(homePathFor(teacherUser)).toBe("/");
    asHost("staff");
    expect(homePathFor(studentUser)).toBe("/403");
  });
});

/**
 * A class's join link (§5.8). Fails when the link, its label or the QR's line
 * take the origin of the page the teacher has open.
 */
describe("a join link", () => {
  it("names the student host from the staff host", () => {
    asHost("staff");

    expect(joinLinkOf("K7M3-P9QR")).toBe("https://my.quizzivy.com/join/K7M3-P9QR");
    expect(joinLinkLabel("K7M3-P9QR")).toBe("my.quizzivy.com/join/K7M3-P9QR");
    expect(joinSite()).toBe("my.quizzivy.com");
  });

  it.each(["student", "all"] as const)(
    "names this page's own host on the %s host",
    (kind) => {
      asHost(kind);

      expect(joinLinkOf("K7M3-P9QR")).toBe(`${window.location.origin}/join/K7M3-P9QR`);
      expect(joinLinkLabel("K7M3-P9QR")).toBe(`${window.location.host}/join/K7M3-P9QR`);
    },
  );
});

/**
 * The skeleton the boot splash fades onto. Fails when a host draws the shell
 * of pages it does not serve: the student's shell at the staff host's root,
 * whose user is on the way to a console, or a console's at the student host.
 */
describe("the skeleton under the splash on each host", () => {
  const drawn = (path: string) =>
    render(<>{skeletonFor(path)}</>).container.innerHTML !== "";

  it.each([
    ["/", true, false, true],
    ["/classes", true, false, true],
    ["/settings/appearance", true, false, true],
    [`/assignments/${ATTEMPT}`, true, false, true],
    [`/attempts/${ATTEMPT}/result`, true, false, true],
    [`/attempts/${ATTEMPT}`, false, false, false],
    ["/teacher", false, true, true],
    ["/teacher/tests", false, true, true],
    ["/login", false, false, false],
    ["/join/K7M3-P9QR", false, false, false],
    ["/classesX", false, false, false],
  ] as const)("at %s", (path, student, staff, one) => {
    asHost("student");
    expect(drawn(path)).toBe(student);
    asHost("staff");
    expect(drawn(path)).toBe(staff);
    asHost("all");
    expect(drawn(path)).toBe(one);
  });
});
