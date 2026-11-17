import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/shared/IconTile";
import { FLAGGED } from "@/features/integrity/tones";
import { attemptSheetPath, type ContextEvent } from "../api";

/**
 * AttemptEventCard is a flagged attempt of the thread's student, shown to
 * staff at its moment in the stream (DG-91, teacher-only): the flag in D8's
 * danger tones, "{title} · left the test {n} times", the time, and Open
 * attempt. It reports what was recorded and concludes nothing.
 */
export function AttemptEventCard({
  event,
  time,
}: Readonly<{ event: ContextEvent; time: string }>) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="attempt-event"
      className="bg-card shadow-card flex w-[min(420px,86%)] flex-wrap items-center gap-3 self-start rounded-xl border p-3"
    >
      <IconTile icon={Flag} size={30} tone={FLAGGED.tone} />
      <span className="min-w-0 flex-[1_1_180px]">
        <span className="block text-sm font-medium">
          {t("messages.attemptEvent", { title: event.title, count: event.focusLost })}
        </span>
        <span className="text-muted-fg block text-xs">{time}</span>
      </span>
      <Button asChild variant="outline" size="sm" className="max-[767px]:h-10">
        <Link to={attemptSheetPath(event)}>{t("messages.openAttempt")}</Link>
      </Button>
    </div>
  );
}
