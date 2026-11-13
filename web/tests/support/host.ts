import { vi } from "vitest";
import type { HostKind } from "@/app/host";

export const STUDENT_HOST = "https://my.quizzivy.com";
export const STAFF_HOST = "https://portal.quizzivy.com";

/**
 * asHost makes the page under test the named host (§5.8) by setting the two
 * build inputs `hostKind` reads: the page's own origin for the host it is to
 * be, and the production origin for the other. `all` names both, so the page
 * is neither. A test that calls it restores the environment with
 * `vi.unstubAllEnvs()` afterwards.
 */
export function asHost(kind: HostKind): void {
  vi.stubEnv(
    "VITE_STUDENT_APP_URL",
    kind === "student" ? window.location.origin : STUDENT_HOST,
  );
  vi.stubEnv(
    "VITE_STAFF_APP_URL",
    kind === "staff" ? window.location.origin : STAFF_HOST,
  );
}
