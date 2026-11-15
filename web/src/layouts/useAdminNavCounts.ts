import { useQuery } from "@tanstack/react-query";
import { adminSummaryQuery } from "@/features/admin-overview/api";
import { adminCreditsQuery } from "@/features/ai-credits/api";
import { publicStatusQuery } from "@/features/ai/api";
import { useCan } from "@/features/auth/permissions";
import { useIdlePolling, useRefetchOnResume } from "@/hooks/useIdlePolling";
import type { NavFigures } from "@/layouts/shell/nav";

const POLL_MS = 60_000;

/**
 * useAdminNavCounts reads the figures of the Admin sidebar's badges, once a
 * minute while the user is there (`useIdlePolling`): the accounts that must
 * change their password, for a holder of `people.users.manage`, the
 * consultation requests nobody has handled, for a holder of `system.leads`,
 * and the AI credit requests waiting for an Admin, for a holder of
 * `ai.credits.manage` while the server has an assistant. The first two come
 * from one read, which is not made for a user who holds neither key. A failed
 * read draws no badge.
 */
export function useAdminNavCounts(): NavFigures | null {
  const manages = useCan("ai.credits.manage");
  const manageUsers = useCan("people.users.manage");
  const readLeads = useCan("system.leads");
  const status = useQuery({
    ...publicStatusQuery(),
    select: (answer) => answer.ai,
    enabled: manages,
  });
  const enabled = manages && status.data === true;
  const refetchInterval = useIdlePolling(POLL_MS, enabled);
  const credits = useQuery({
    ...adminCreditsQuery(),
    select: (answer) => answer.requests.length,
    enabled,
    staleTime: POLL_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
  });
  useRefetchOnResume(credits.refetch, enabled);
  const counted = manageUsers || readLeads;
  const summaryInterval = useIdlePolling(POLL_MS, counted);
  const summary = useQuery({
    ...adminSummaryQuery(),
    enabled: counted,
    staleTime: POLL_MS,
    refetchInterval: summaryInterval,
    refetchIntervalInBackground: false,
  });
  useRefetchOnResume(summary.refetch, counted);
  const mustChangePassword = summary.data?.mustChangePassword;
  const newLeads = summary.data?.newLeads;
  const figures: Record<string, number> = {};
  if (enabled && !credits.isError && credits.data !== undefined) {
    figures.creditRequests = credits.data;
  }
  if (manageUsers && !summary.isError && typeof mustChangePassword === "number") {
    figures.mustChangePassword = mustChangePassword;
  }
  if (readLeads && !summary.isError && typeof newLeads === "number") {
    figures.newLeads = newLeads;
  }
  return Object.keys(figures).length === 0 ? null : figures;
}
