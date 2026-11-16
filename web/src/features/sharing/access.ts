import { useCallback } from "react";
import { useCan } from "@/features/auth/permissions";
import { useAuthStore } from "@/stores/auth";

/** Owned is any shared read model: it names its owner. */
export type Owned = Readonly<{ owner: Readonly<{ id: string }> }>;

/**
 * isOwner reports whether `me` owns the content. The contract's `access`
 * reads `owner` for anyone holding `scope.all` too, so ownership is told from
 * `owner.id`, never from `access` (ContentAccess).
 */
export function isOwner(
  content: Owned,
  me: Readonly<{ id: string }> | null | undefined,
): boolean {
  return me !== null && me !== undefined && content.owner.id === me.id;
}

/**
 * useCanShare answers, for a piece of content, whether the signed-in user may
 * open its share dialog: its owner, holding `content.share`. A recipient
 * never shares further (D4), and an admin reading someone else's test does
 * not share it from here either.
 */
export function useCanShare(): (content: Owned) => boolean {
  const holds = useCan("content.share");
  const me = useAuthStore((state) => state.user);
  return useCallback((content: Owned) => holds && isOwner(content, me), [holds, me]);
}
