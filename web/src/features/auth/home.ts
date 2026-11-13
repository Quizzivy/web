import { ADMIN_HOME } from "@/app/adminPaths";
import { hostKind, type HostKind } from "@/app/host";
import type { User } from "./api";
import { hasWorkspace } from "./permissions";

/** STUDENT_HOME is the student's home, the root of the student host. */
export const STUDENT_HOME = "/";

/** FORBIDDEN_PATH is the 403 page every host serves. */
export const FORBIDDEN_PATH = "/403";

/** HomeUser is what `homePathFor` reads of the signed-in user. */
export type HomeUser = Pick<User, "workspaces"> &
  Partial<Pick<User, "permissions" | "preferences">>;

/**
 * Where a signed-in user belongs on this host (§3's route trees, §5.8). At the
 * student host it is the student's home. Elsewhere a built-in Admin, the one
 * holder of `scope.all`, opens the console they last switched to
 * (`preferences.workspace`) and the Admin console the first time; anyone else
 * with a teacher workspace opens it, and a user with only the admin workspace
 * opens the Admin console. A user with neither opens the student's home where
 * the host has one, and the 403 page at the staff host.
 */
export function homePathFor(
  user: HomeUser | null | undefined,
  kind: HostKind = hostKind(),
): string {
  if (kind === "student") return STUDENT_HOME;
  const teacher = hasWorkspace(user, "teacher");
  const admin = hasWorkspace(user, "admin");
  if (teacher && admin && user?.permissions?.includes("scope.all"))
    return user.preferences?.workspace === "teacher" ? "/teacher" : ADMIN_HOME;
  if (teacher) return "/teacher";
  if (admin) return ADMIN_HOME;
  return kind === "staff" ? FORBIDDEN_PATH : STUDENT_HOME;
}

/** Resolves the `?next=` a guard attached, falling back to the user's home. */
export function destinationAfterSignIn(
  next: string | null | undefined,
  user: HomeUser | null | undefined,
): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return homePathFor(user);
}

/**
 * Starts fetching the student home's chunks while the authorization code is
 * still out being exchanged.
 */
export function preloadStudentHome(): void {
  void import("@/layouts/StudentLayout").catch(() => undefined);
  void import("@/features/assignments/pages/StudentHomePage").catch(() => undefined);
}
