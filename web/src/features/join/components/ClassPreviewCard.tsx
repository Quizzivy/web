import { useTranslation } from "react-i18next";
import { CircleCheck } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import type { ClassSchedule } from "@/features/join/api";
import { formatScheduleLine } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";

/**
 * ClassPreviewCard is what a valid code finds: the class name, its teacher,
 * and when and where it meets ("T7 · CN, 09:00 · Phòng 4"), and nothing else
 * the public preview could leak (§6.5): no count of any kind (DG-02). A class
 * with no schedule shows its room alone, or nothing. `variant` is the public
 * page's card, which puts the schedule under the name, or the row the
 * student's Join dialog draws, "{teacher} · {schedule}" (T-R8.14).
 */
export function ClassPreviewCard({
  name,
  teacherName,
  schedule = null,
  room = null,
  variant = "card",
}: Readonly<{
  name: string;
  teacherName: string;
  schedule?: ClassSchedule | null;
  room?: string | null;
  variant?: "card" | "row";
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const when = formatScheduleLine(schedule, room, locale, { fallback: false });
  if (variant === "row")
    return (
      <div className="bg-success-soft flex items-center gap-3 rounded-[11px] px-3.5 py-3">
        <CircleCheck aria-hidden="true" className="text-success-ink size-5 flex-none" />
        <span className="min-w-0">
          <span className="sr-only">{t("join.found")}</span>
          <span className="block text-base font-semibold break-words">{name}</span>
          <span className="text-muted-fg text-meta block leading-normal break-words">
            {when === "" ? teacherName : `${teacherName} · ${when}`}
          </span>
        </span>
      </div>
    );
  return (
    <div className="shadow-card flex flex-col gap-3 rounded-2xl border p-4">
      <span className="bg-success-soft text-success-ink text-meta inline-flex items-center gap-1.5 self-start rounded-full px-[9px] py-0.5">
        <CircleCheck aria-hidden="true" className="size-[13px]" />
        {t("join.found")}
      </span>
      <div>
        <p className="text-lg font-semibold break-words">{name}</p>
        {when === "" ? null : (
          <p className="text-muted-fg text-ui break-words">{when}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <Avatar name={teacherName} size="36" className="size-8.5 font-semibold" />
        <span className="text-base font-medium break-words">{teacherName}</span>
      </div>
    </div>
  );
}
