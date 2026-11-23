import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemText,
  DropdownMenuLabel,
  DropdownMenuMeta,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionPages } from "@/features/attendance/api";
import { isToday, sessionLabel } from "@/features/attendance/dates";
import { useLocale } from "@/lib/i18n/useLocale";

/**
 * SessionPicker is the register's session button ("{day} · {time}" with a
 * chevron) and its 260px menu titled "Sessions": the class's started
 * sessions, newest first, each with "Today", "Saved" or "Not taken", and
 * "Load more" while older ones remain. Choosing one hands its id to
 * `onPick`, which may ask before the register changes.
 */
export function SessionPicker({
  classId,
  current,
  label,
  now,
  onPick,
}: Readonly<{
  classId: string;
  current: string;
  label: string;
  now: Date;
  onPick: (sessionId: string) => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const sessions = useSessionPages(["class", classId], { classId });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={t("attendance.picker.button", { label })}>
          <CalendarDays aria-hidden="true" className="text-muted-fg" />
          {label}
          <ChevronDown aria-hidden="true" className="text-muted-fg size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-65">
        <DropdownMenuLabel>{t("attendance.picker.title")}</DropdownMenuLabel>
        {sessions.isPending ? (
          <DropdownMenuItem disabled>{t("common.loading")}</DropdownMenuItem>
        ) : null}
        <DropdownMenuRadioGroup value={current} onValueChange={onPick}>
          {sessions.items.map((session) => {
            let meta = t("attendance.picker.missing");
            if (isToday(session.startsAt, now)) meta = t("attendance.today");
            else if (session.marked) meta = t("attendance.picker.saved");
            return (
              <DropdownMenuRadioItem key={session.id} value={session.id}>
                <DropdownMenuItemText>
                  {sessionLabel(session.startsAt, locale)}
                </DropdownMenuItemText>
                <DropdownMenuMeta>{meta}</DropdownMenuMeta>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {sessions.hasMore ? (
          <DropdownMenuItem
            disabled={sessions.loadingMore}
            onSelect={(event) => {
              event.preventDefault();
              sessions.loadMore();
            }}
          >
            {sessions.loadingMore
              ? t("common.loadingMore")
              : t("attendance.picker.more")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
