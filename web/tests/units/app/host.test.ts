import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hostKind,
  hostKindOf,
  onStudentHost,
  otherHostSignIn,
  studentOrigin,
  type HostKind,
} from "@/app/host";

const STUDENT = "https://my.quizzivy.com";
const STAFF = "https://portal.quizzivy.com";

/** hosts sets the two build inputs; `here` names the one this page is. */
function hosts(here: HostKind) {
  vi.stubEnv(
    "VITE_STUDENT_APP_URL",
    here === "student" ? window.location.origin : STUDENT,
  );
  vi.stubEnv("VITE_STAFF_APP_URL", here === "staff" ? window.location.origin : STAFF);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hostKindOf", () => {
  // Fails when an origin is matched by anything but equality: a prefix match
  // would make my.quizzivy.com.attacker.test the student host.
  it.each([
    [STUDENT, "student"],
    [STAFF, "staff"],
    ["https://app.quizzivy.com", "all"],
    ["https://quizzivy.com", "all"],
    [STUDENT.replace("https:", "http:"), "all"],
    ["https://my.quizzivy.com:8443", "all"],
    ["https://my.quizzivy.com.attacker.test", "all"],
    ["http://localhost:5173", "all"],
  ])("reads %s as %s", (here, kind) => {
    expect(hostKindOf(here, STUDENT, STAFF)).toBe(kind);
  });

  // Fails when a half-configured or one-host build splits its pages.
  it.each([
    [null, null],
    [STUDENT, null],
    [null, STAFF],
    [STUDENT, STUDENT],
  ])(
    "serves every page from one host when the hosts are %s and %s",
    (student, staff) => {
      expect(hostKindOf(STUDENT, student, staff)).toBe("all");
    },
  );
});

describe("the host this page is served from", () => {
  it("is one host for every page when the build names none", () => {
    vi.stubEnv("VITE_STUDENT_APP_URL", "");
    vi.stubEnv("VITE_STAFF_APP_URL", "");

    expect(hostKind()).toBe("all");
    expect(studentOrigin()).toBe(window.location.origin);
    expect(otherHostSignIn()).toBeNull();
  });

  it("is one host for every page at an origin that is neither", () => {
    vi.stubEnv("VITE_STUDENT_APP_URL", STUDENT);
    vi.stubEnv("VITE_STAFF_APP_URL", STAFF);

    expect(hostKind()).toBe("all");
    expect(studentOrigin()).toBe(window.location.origin);
    expect(otherHostSignIn()).toBeNull();
  });

  it("is the student host where the build says so, and sends a refused account to the staff host", () => {
    hosts("student");

    expect(hostKind()).toBe("student");
    expect(studentOrigin()).toBe(window.location.origin);
    expect(otherHostSignIn()).toEqual({
      host: "portal.quizzivy.com",
      href: "https://portal.quizzivy.com/login",
    });
  });

  // Fails when the join link takes the origin of the page the teacher has
  // open, which at the staff host is not where a student joins.
  it("is the staff host where the build says so, and names the student host for a join link", () => {
    hosts("staff");

    expect(hostKind()).toBe("staff");
    expect(studentOrigin()).toBe(STUDENT);
    expect(otherHostSignIn()).toEqual({
      host: "my.quizzivy.com",
      href: "https://my.quizzivy.com/login",
    });
  });

  // Fails when a link to one of the student's pages is written as a path on
  // the staff host, which answers that path with its 404.
  it("writes a student page's address in full only from the staff host", () => {
    hosts("staff");
    expect(onStudentHost("/join")).toBe("https://my.quizzivy.com/join");
    hosts("student");
    expect(onStudentHost("/join")).toBeNull();
    vi.stubEnv("VITE_STUDENT_APP_URL", STUDENT);
    vi.stubEnv("VITE_STAFF_APP_URL", STAFF);
    expect(onStudentHost("/join")).toBeNull();
  });

  it("reads a build input written with a trailing slash", () => {
    vi.stubEnv("VITE_STUDENT_APP_URL", `${window.location.origin}/`);
    vi.stubEnv("VITE_STAFF_APP_URL", `${STAFF}/`);

    expect(hostKind()).toBe("student");
    expect(otherHostSignIn()?.href).toBe("https://portal.quizzivy.com/login");
  });
});
