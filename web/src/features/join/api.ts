import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components, operations } from "@/lib/api/schema";

/**
 * JoinPreview is what a valid code shows before anything is joined: the
 * class, its teacher, its weekly schedule and its room, and nothing else
 * (§6.5, DG-02: no count of any kind).
 */
export type JoinPreview =
  operations["previewJoinCode"]["responses"][200]["content"]["application/json"];

/** ClassSchedule is a class's weekly slots and free-text label. */
export type ClassSchedule = components["schemas"]["ClassSchedule"];

export type Class = components["schemas"]["Class"];

/**
 * §6.2's confirm step. Public: the student has no account yet, which is the
 * whole reason this screen exists -- they see WHICH class they are joining
 * before they authenticate.
 */
export function previewJoinCode(
  joinCode: string,
  signal?: AbortSignal,
): Promise<JoinPreview> {
  return api(
    "post",
    "/join/preview",
    signal ? { body: { joinCode }, signal } : { body: { joinCode } },
  );
}

/**
 * lookupJoinCode is previewJoinCode for a caller that remembers the answer:
 * it resolves null when the server refuses the code, whatever its reason, so
 * a refusal can be kept beside a found class and is not asked about again.
 * Anything else that goes wrong still rejects.
 */
export async function lookupJoinCode(
  joinCode: string,
  signal?: AbortSignal,
): Promise<JoinPreview | null> {
  try {
    return await previewJoinCode(joinCode, signal);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return null;
    throw cause;
  }
}

/** The already-signed-in half of §6.2. */
export function joinClass(joinCode: string): Promise<Class> {
  return api("post", "/app/classes/join", { body: { joinCode } });
}
