import { ApiError } from "@/lib/api/errors";

/** Stale is the last change a refused save names: who made it, when. */
export type Stale = Readonly<{ name: string | null; at: string }>;

/**
 * staleOf reads a 409 `STALE_WRITE`'s details (T-R7.5): `updatedBy`, a
 * person or null, and `updatedAt`. Anything else is not stale.
 */
export function staleOf(cause: unknown): Stale | null {
  if (!(cause instanceof ApiError) || cause.code !== "STALE_WRITE") return null;
  const by = cause.details?.["updatedBy"] as { name?: unknown } | null | undefined;
  const at = cause.details?.["updatedAt"];
  return {
    name: typeof by?.name === "string" ? by.name : null,
    at: typeof at === "string" ? at : new Date().toISOString(),
  };
}
