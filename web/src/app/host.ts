/**
 * HostKind is which of Quizzivy's web hosts a page is served from (§5.8):
 * `student` for the student host, `staff` for the teacher's and the Admin's,
 * and `all` for any other origin, where one host serves every page (local
 * development, a preview).
 */
export type HostKind = "student" | "staff" | "all";

function originOf(raw: string | undefined): string | null {
  let origin = raw?.trim() ?? "";
  while (origin.endsWith("/")) origin = origin.slice(0, -1);
  return origin === "" ? null : origin;
}

function configured() {
  return {
    student: originOf(import.meta.env["VITE_STUDENT_APP_URL"]),
    staff: originOf(import.meta.env["VITE_STAFF_APP_URL"]),
  };
}

/**
 * hostKindOf names the host `here` is, given the two hosts' origins: the one it
 * equals, and `all` when it equals neither, when either is unset and when the
 * two are one origin.
 */
export function hostKindOf(
  here: string,
  student: string | null,
  staff: string | null,
): HostKind {
  if (!student || !staff || student === staff) return "all";
  if (here === student) return "student";
  if (here === staff) return "staff";
  return "all";
}

/** hostKind names the host this page is served from. */
export function hostKind(): HostKind {
  const { student, staff } = configured();
  return hostKindOf(window.location.origin, student, staff);
}

/**
 * studentOrigin is the origin of the student host, where a class's join link
 * opens: the configured one at either host, and this page's own where one host
 * serves every page.
 */
export function studentOrigin(): string {
  const { student } = configured();
  return hostKind() === "all" || !student ? window.location.origin : student;
}

/**
 * otherHostSignIn is the sign-in page of the host this one is not, for an
 * account that was refused here because it belongs there. Null where one host
 * serves every page.
 */
export function otherHostSignIn(): { host: string; href: string } | null {
  const { student, staff } = configured();
  const others = { student: staff, staff: student, all: null };
  const other = others[hostKind()];
  if (!other) return null;
  return { host: new URL(other).host, href: `${other}/login` };
}
