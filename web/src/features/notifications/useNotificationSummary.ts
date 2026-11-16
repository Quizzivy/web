import { useQuery } from "@tanstack/react-query";
import { useIdlePolling, useRefetchOnResume } from "@/hooks/useIdlePolling";
import { getMySummary, notificationKeys, type NotificationAudience } from "./api";

/** SUMMARY_POLL_MS is the active reader's sixty-second notification interval. */
export const SUMMARY_POLL_MS = 60_000;

/**
 * useNotificationSummary returns the unread counts of `/me/summary` for
 * `audience`'s kinds, polled
 * idle-aware with an immediate read on resume: `unread`, the bell's, and
 * `unreadMessages`, the student's Messages button's (T-R7.21). It keeps the
 * last counts while a later read is in flight, so a bell's dot does not blink
 * on each poll, and they are zero while disabled, before the first read
 * answers, and after a read fails.
 */
export function useNotificationSummary(
  audience: NotificationAudience,
  enabled = true,
): { unread: number; unreadMessages: number } {
  const refetchInterval = useIdlePolling(SUMMARY_POLL_MS, enabled);
  const query = useQuery({
    queryKey: notificationKeys.summary(audience),
    queryFn: ({ signal }) => getMySummary(audience, signal),
    enabled,
    refetchInterval,
    refetchIntervalInBackground: false,
  });
  useRefetchOnResume(query.refetch, enabled);
  const read = enabled && query.isSuccess ? query.data : null;
  return {
    unread: read?.unreadNotifications ?? 0,
    unreadMessages: read?.unreadMessages ?? 0,
  };
}
