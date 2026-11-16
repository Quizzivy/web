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

/** sharesKey is the query key of one resource's "People with access". */
export function sharesKey(kind: ShareKind, resourceId: string) {
  return ["shares", kind, resourceId] as const;
}

/** DIRECTORY_KEY heads every lookup the share dialog's picker makes. */
export const DIRECTORY_KEY = ["teacher-directory"] as const;

/** searchTeacherDirectory finds at most ten colleagues by name or email. */
export function searchTeacherDirectory(q: string, signal?: AbortSignal) {
  return api(
    "get",
    "/teacher/directory/teachers",
    signal ? { query: { q }, signal } : { query: { q } },
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
 * useTeacherLookup asks the directory for `term` once it is not empty and
 * `fresh` says the reader has stopped typing it. A lookup in flight when the
 * term changes is cancelled by the picker (`cancelQueries` on DIRECTORY_KEY),
 * which aborts its request through the query's signal.
 */
export function useTeacherLookup(term: string, fresh: boolean) {
  return useQuery({
    queryKey: [...DIRECTORY_KEY, term],
    queryFn: ({ signal }) => searchTeacherDirectory(term, signal),
    enabled: fresh && term !== "",
    staleTime: 30_000,
    retry: false,
  });
}
