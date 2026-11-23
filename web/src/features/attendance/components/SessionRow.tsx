import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionChip } from "@/features/attendance/components/SessionChip";
import { registerHref, type AttendanceSessionRow } from "@/features/attendance/api";
import { clock, dayLabel, isToday } from "@/features/attendance/dates";
import { useLocale } from "@/lib/i18n/useLocale";

/**
 * SessionRow is one session in a card of the Attendance page: its start over
 * its day ("Today" for today's), the class with its room and roster, or its
 * counts once saved, the register's chip, and "Take attendance" or "Open".
 * The whole row opens the class's Attendance tab on the session; the button
 * is the link a keyboard reaches.
 */
export function SessionRow({
  session,
  now,
}: Readonly<{ session: AttendanceSessionRow; now: Date }>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const today = isToday(session.startsAt, now);
  const counts = session.marked ? session.counts : null;
  const roster = t("attendance.students", { count: session.studentCount });
  let meta = roster;
  if (counts !== null)
    meta = t("attendance.savedCounts", {
      p: counts.present,
      l: counts.late,
      a: counts.absent,
    });
  else if (session.room !== null) meta = `${session.room} · ${roster}`;
  let state: "saved" | "today" | "missing" = "missing";
  if (session.marked) state = "saved";
  else if (today) state = "today";

  return (
    <li className="hover:bg-muted relative flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t px-4 py-3">
      <span className="flex w-24 flex-none flex-col leading-[1.3]">
        <span className="text-ui font-semibold tabular-nums">
          {clock(session.startsAt)}
        </span>
        <span className="text-muted-fg text-xs whitespace-nowrap">
          {today ? t("attendance.today") : dayLabel(session.startsAt, locale)}
        </span>
      </span>
      <span className="min-w-0 flex-[1_1_220px]">
        <span className="text-ui block truncate font-medium">{session.className}</span>
        <span className="text-muted-fg text-meta block">{meta}</span>
      </span>
      <span className="flex-none">
        <SessionChip state={state} />
      </span>
      <Button
        asChild
        size="sm"
        variant={session.marked ? "outline" : "default"}
        className="h-8 px-3 after:absolute after:inset-0"
      >
        <Link
          to={registerHref(session.classId, session.id)}
          aria-label={t(session.marked ? "attendance.openFor" : "attendance.takeFor", {
            name: session.className,
            time: clock(session.startsAt),
          })}
        >
          {session.marked ? null : <CalendarCheck aria-hidden="true" />}
          {t(session.marked ? "attendance.open" : "attendance.take")}
        </Link>
      </Button>
    </li>
  );
}
