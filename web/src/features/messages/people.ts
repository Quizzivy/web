import type { TFunction } from "i18next";
import { roleName } from "@/lib/roleName";
import type { MessageRecipient } from "./api";

/**
 * recipientSub is a New message row's sub-line: a colleague's role, or a
 * student's current classes, the caller's first, else "In no class" (Q4, Q9).
 */
export function recipientSub(row: MessageRecipient, t: TFunction): string {
  if (row.roleName !== null)
    return roleName({ builtinKey: row.roleBuiltinKey, name: row.roleName }, t);
  const names = [...row.classNames, ...row.otherClassNames];
  return names.length > 0 ? names.join(", ") : t("messages.noClass");
}
