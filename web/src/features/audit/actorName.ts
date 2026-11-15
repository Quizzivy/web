import type { TFunction } from "i18next";
import type { AuditEntry } from "./api";

/**
 * actorName is who an audit entry names: the account that made it; "Người
 * dùng đã xoá" when that account was removed since (`actorRemoved`); and the
 * system only for the system's own work (AO-11, the owner's call of
 * 2026-11-15). The search and the CSV export use the same two names.
 */
export function actorName(
  entry: Pick<AuditEntry, "actor" | "actorRemoved">,
  t: TFunction,
): string {
  if (entry.actor) return entry.actor.name;
  return entry.actorRemoved === true ? t("audit.removedActor") : t("audit.system");
}
