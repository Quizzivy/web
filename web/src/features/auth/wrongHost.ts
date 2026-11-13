import { ApiError } from "@/lib/api/errors";

/**
 * isWrongHost reports whether a sign-in was refused because its account
 * belongs at the other web host (§5.8): the `403 FORBIDDEN` of `login`,
 * `googleAuth` and `setPasswordWithLink`.
 */
export function isWrongHost(cause: unknown): boolean {
  return (
    cause instanceof ApiError && cause.status === 403 && cause.code === "FORBIDDEN"
  );
}
