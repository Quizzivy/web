import { useTranslation } from "react-i18next";
import { Eye, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ShareAccess } from "../api";

/**
 * AccessPill is Shared with me's access pill: a pencil on the accent tint
 * for Can edit, an eye on the muted tint for Can use.
 */
export function AccessPill({ access }: Readonly<{ access: ShareAccess }>) {
  const { t } = useTranslation();
  return access === "edit" ? (
    <Badge variant="brand">
      <Pencil aria-hidden="true" />
      {t("sharing.canEdit")}
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-muted text-muted-fg">
      <Eye aria-hidden="true" />
      {t("sharing.canUse")}
    </Badge>
  );
}
