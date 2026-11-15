import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { LeadStatus } from "@/features/leads/api";
import { cn } from "@/lib/utils";

const LOOKS: Record<
  LeadStatus,
  { variant: "warning" | "info" | "secondary"; className?: string }
> = {
  new: { variant: "warning" },
  contacted: { variant: "info" },
  closed: { variant: "secondary", className: "bg-muted text-muted-fg" },
};

/**
 * LeadStatusBadge is a request's status in the deck's pill: warning for one
 * nobody has handled, as the sidebar's count is, info for one the centre has
 * called, and muted for one that is closed.
 */
export function LeadStatusBadge({ status }: Readonly<{ status: LeadStatus }>) {
  const { t } = useTranslation();
  const look = LOOKS[status];
  return (
    <Badge
      variant={look.variant}
      dot
      className={cn("max-w-full px-2 font-medium", look.className)}
    >
      <span className="min-w-0 truncate">{t(`leads.status.${status}`)}</span>
    </Badge>
  );
}
