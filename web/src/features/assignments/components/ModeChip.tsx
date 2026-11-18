import { useTranslation } from "react-i18next";
import { TimerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssignmentMode } from "@/features/assignments/api";
import { cn } from "@/lib/utils";

/**
 * ModeChip is the "Flexible" chip a flexible assignment carries in the list
 * and in its heading (F1). A strict assignment reads as it always has, so it
 * draws nothing.
 */
export function ModeChip({
  mode,
  className,
}: Readonly<{ mode: AssignmentMode; className?: string }>) {
  const { t } = useTranslation();
  if (mode !== "flexible") return null;
  return (
    <Badge variant="secondary" className={cn("flex-none", className)}>
      <TimerOff aria-hidden="true" />
      {t("assignments.wizard.modeFlexible")}
    </Badge>
  );
}
