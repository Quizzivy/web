import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type ShareKind = components["schemas"]["ShareKind"];
export type ShareAccess = components["schemas"]["ShareAccess"];
export type ShareTeacher = components["schemas"]["ShareTeacher"];
export type ShareGrant = components["schemas"]["ShareGrant"];
export type ShareList = components["schemas"]["ShareList"];
export type ShareCreate = components["schemas"]["ShareCreate"];
export type ShareCreateResult = components["schemas"]["ShareCreateResult"];
export type ShareSkipCode = components["schemas"]["ShareSkipCode"];

/** sharesKey is the query key of one resource's "People with access". */
export function sharesKey(kind: ShareKind, resourceId: string) {
  return ["shares", kind, resourceId] as const;
}

/** DIRECTORY_KEY heads every lookup the share dialog's picker makes. */
export const DIRECTORY_KEY = ["teacher-directory"] as const;

/**
 * searchTeacherDirectory finds at most ten colleagues by name or email, or,
 * for an empty `q`, lists them by name (the picker just opened).
 */
export function searchTeacherDirectory(q: string, signal?: AbortSignal) {
  const query = q === "" ? {} : { q };
  return api(
    "get",
    "/teacher/directory/teachers",
    signal ? { query, signal } : { query },
  );
}

export function listShares(kind: ShareKind, resourceId: string, signal?: AbortSignal) {
  const query = { kind, resourceId };
  return api("get", "/teacher/shares", signal ? { query, signal } : { query });
}

export function createShares(body: ShareCreate) {
  return api("post", "/teacher/shares", { body });
}

export function updateShare(shareId: string, access: ShareAccess) {
  return api("patch", "/teacher/shares/{shareId}", {
    path: { shareId },
    body: { access },
  });
}

export function deleteShare(shareId: string) {
  return api("delete", "/teacher/shares/{shareId}", { path: { shareId } });
}

/**
 * useShares reads who has access to a resource while `enabled`. `onFailed`
 * hears of a read that failed, so a 403 can close the dialog it was for.
 */
export function useShares(
  kind: ShareKind,
  resourceId: string,
  enabled: boolean,
  onFailed?: (cause: unknown) => void,
) {
  return useQuery({
    queryKey: sharesKey(kind, resourceId),
    queryFn: async ({ signal }) => {
      try {
        return await listShares(kind, resourceId, signal);
      } catch (cause) {
        if (!signal.aborted) onFailed?.(cause);
        throw cause;
      }
    },
    enabled,
    retry: false,
  });
}

/** withGrants adds the grants a share made to the list, each once. */
export function withGrants(list: ShareList, made: readonly ShareGrant[]): ShareList {
  const held = new Set(list.grants.map((grant) => grant.id));
  return { ...list, grants: [...list.grants, ...made.filter((g) => !held.has(g.id))] };
}

/** withGrant puts `grant` in place of the grant with its id. */
export function withGrant(list: ShareList, grant: ShareGrant): ShareList {
  return {
    ...list,
    grants: list.grants.map((held) => (held.id === grant.id ? grant : held)),
  };
}

/** withoutGrant takes the grant with `id` out of the list. */
export function withoutGrant(list: ShareList, id: string): ShareList {
  return { ...list, grants: list.grants.filter((held) => held.id !== id) };
}

/**
 * useTeacherLookup asks the directory for `term` (everyone, by name, when it
 * is empty) once `fresh` says the reader has stopped typing it and the list is
 * open. A lookup in flight when the
 * term changes is cancelled by the picker (`cancelQueries` on DIRECTORY_KEY),
 * which aborts its request through the query's signal.
 */
export function useTeacherLookup(term: string, fresh: boolean) {
  return useQuery({
    queryKey: [...DIRECTORY_KEY, term],
    queryFn: ({ signal }) => searchTeacherDirectory(term, signal),
    enabled: fresh,
    staleTime: 30_000,
    retry: false,
  });
}

export type SharedWithMeItem = components["schemas"]["SharedWithMeItem"];
export type SharedWithMeCounts = components["schemas"]["SharedWithMeCounts"];
export type SharedWithMeQuery = Readonly<{
  kind?: ShareKind | undefined;
  q?: string | undefined;
  page: number;
  limit: number;
}>;

/** SHARED_WITH_ME_KEY heads every read of Shared with me, whatever its tab, search or page. */
export const SHARED_WITH_ME_KEY = ["shared-with-me"] as const;

/**
 * listSharedWithMe reads one page of what other teachers shared with the
 * caller, newest grant first, with the tabs' counts (before `kind`, after
 * `q`). An empty `q` and no `kind` are left out of the query.
 */
export function listSharedWithMe(
  { kind, q, page, limit }: SharedWithMeQuery,
  signal?: AbortSignal,
) {
  const query = {
    page,
    limit,
    ...(kind === undefined ? {} : { kind }),
    ...(q === undefined || q === "" ? {} : { q }),
  };
  return api("get", "/teacher/shared-with-me", signal ? { query, signal } : { query });
}

/** removeSharedWithMe takes a grant made to the caller off their list ("Remove from my list"). */
export function removeSharedWithMe(shareId: string) {
  return api("delete", "/teacher/shared-with-me/{shareId}", { path: { shareId } });
}

/** copyTest makes the caller's own draft from a test's current draft ("Make a copy"). */
export function copyTest(id: string) {
  return api("post", "/teacher/tests/{id}/copy", { path: { id } });
}

/** copyQuestionSet makes the caller's own set, with their own questions, from a whole set. */
export function copyQuestionSet(id: string) {
  return api("post", "/teacher/question-sets/{id}/copy", { path: { id } });
}

/**
 * copyShared makes the caller's own copy of what a grant shares: a test's
 * current draft, or a whole question set.
 */
export async function copyShared(
  item: Pick<SharedWithMeItem, "kind" | "resourceId">,
): Promise<void> {
  if (item.kind === "test") await copyTest(item.resourceId);
  else await copyQuestionSet(item.resourceId);
}
