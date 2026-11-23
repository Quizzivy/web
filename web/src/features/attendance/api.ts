import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** AttendanceSessionRow is a started session as the Attendance lists show it. */
export type AttendanceSessionRow = components["schemas"]["AttendanceSessionRow"];

/** AttendanceSessionList is one page of `GET /teacher/attendance/sessions`. */
export type AttendanceSessionList = components["schemas"]["AttendanceSessionList"];

/** SessionAttendance is one session's register: its roster, marks and rates. */
export type SessionAttendance = components["schemas"]["SessionAttendance"];

/** AttendanceStudent is one row of a register. */
export type AttendanceStudent = components["schemas"]["AttendanceStudent"];

/** AttendanceStatus is a mark: present, late or absent. */
export type AttendanceStatus = components["schemas"]["AttendanceStatus"];

/** AttendanceMarkInput is one student's mark as the save sends it. */
export type AttendanceMarkInput = components["schemas"]["AttendanceMarkInput"];

/** SessionListParams bound `GET /teacher/attendance/sessions`. */
export type SessionListParams = Readonly<{
  classId?: string;
  since?: string;
  before?: string;
  marked?: boolean;
  limit?: number;
}>;

/** PAGE is how many sessions a list asks for at a time, the server's default. */
export const PAGE = 20;

/**
 * SESSIONS_KEY heads every query of the sessions list, so a save refreshes
 * the Attendance page, the class's badge and its session picker at once.
 */
export const SESSIONS_KEY = ["attendance-sessions"] as const;

/** registerKey is the query key of one session's register. */
export function registerKey(sessionId: string) {
  return ["session-attendance", sessionId] as const;
}

/** listSessions reads `GET /teacher/attendance/sessions`: started sessions, newest first. */
export function listSessions(params: SessionListParams, signal?: AbortSignal) {
  const query: Record<string, unknown> = {};
  if (params.classId !== undefined) query["classId"] = params.classId;
  if (params.since !== undefined) query["since"] = params.since;
  if (params.before !== undefined) query["before"] = params.before;
  if (params.marked !== undefined) query["marked"] = params.marked;
  if (params.limit !== undefined) query["limit"] = params.limit;
  return api(
    "get",
    "/teacher/attendance/sessions",
    signal ? { query, signal } : { query },
  );
}

/**
 * latestSessionQuery reads the class's latest started session with
 * `limit=1`: the session its Attendance tab opens on without `?session=`,
 * and `notMarked`, the tab's badge.
 */
export function latestSessionQuery(classId: string) {
  return queryOptions({
    queryKey: [...SESSIONS_KEY, "latest", classId],
    queryFn: ({ signal }) => listSessions({ classId, limit: 1 }, signal),
  });
}

/**
 * useSessionPages pages through a sessions list twenty at a time, with a
 * cursor that never repeats a page already loaded; the cursor takes the place
 * of a `before` bound, which it is always earlier than. `key` names the list
 * in the cache, under SESSIONS_KEY.
 */
export function useSessionPages(
  key: readonly unknown[],
  params: Omit<SessionListParams, "limit">,
  enabled = true,
) {
  const query = useInfiniteQuery({
    queryKey: [...SESSIONS_KEY, ...key],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listSessions(
        pageParam === undefined
          ? { ...params, limit: PAGE }
          : { ...params, before: pageParam, limit: PAGE },
        signal,
      ),
    getNextPageParam: (last, _pages, _lastParam, pageParams) =>
      last.nextBefore === null || pageParams.includes(last.nextBefore)
        ? undefined
        : last.nextBefore,
    enabled,
  });
  return {
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage) void query.fetchNextPage({ cancelRefetch: false });
    },
    loadingMore: query.isFetchingNextPage,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** registerQuery reads `GET /teacher/sessions/{sessionId}/attendance`. */
export function registerQuery(sessionId: string) {
  return queryOptions({
    queryKey: registerKey(sessionId),
    queryFn: ({ signal }) =>
      api("get", "/teacher/sessions/{sessionId}/attendance", {
        path: { sessionId },
        signal,
      }),
  });
}

/**
 * useSaveRegister writes the marks that changed with
 * `PUT /teacher/sessions/{sessionId}/attendance`. The register it answers
 * replaces the one in the cache, and every sessions list is read again.
 */
export function useSaveRegister(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (marks: AttendanceMarkInput[]) =>
      api("put", "/teacher/sessions/{sessionId}/attendance", {
        path: { sessionId },
        body: { marks },
      }),
    onSuccess: (saved) => {
      client.setQueryData(registerKey(sessionId), saved);
      void client.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

/** registerHref is the address of a session's register, in its class's Attendance tab. */
export function registerHref(classId: string, sessionId: string) {
  const search = new URLSearchParams({ tab: "attendance", session: sessionId });
  return `/teacher/classes/${encodeURIComponent(classId)}?${search.toString()}`;
}
