import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

/**
 * SessionState is where a session's register stands: not taken today, not
 * taken on a day gone by, saved, not open yet or cancelled.
 */
export type SessionState = "today" | "missing" | "saved" | "notStarted" | "cancelled";

const VARIANTS = {
  today: "warning",
  missing: "danger",
  saved: "success",
  notStarted: "secondary",
  cancelled: "danger",
} as const;

/**
 * SessionChip is the status pill beside a session: "Not taken yet" in the
 * warning tone, "Not taken" and "Cancelled" in the danger tone, "Saved" in
 * the success tone, with `savedAt` after it once this page saved it, and
 * "Not started" muted.
 */
export function SessionChip({
  state,
  savedAt,
}: Readonly<{ state: SessionState; savedAt?: string | undefined }>) {
  const { t } = useTranslation();
  return (
    <Badge
      dot
      variant={VARIANTS[state]}
      className={state === "notStarted" ? "text-muted-fg" : undefined}
    >
      {state === "saved" && savedAt !== undefined
        ? t("attendance.chip.savedAt", { time: savedAt })
        : t(`attendance.chip.${state}`)}
    </Badge>
  );
}
