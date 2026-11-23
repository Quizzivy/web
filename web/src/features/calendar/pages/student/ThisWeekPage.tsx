import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ArrowLeft, FileText, RotateCw, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMinute } from "@/hooks/useTick";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import {
  formatClock,
  formatDateRange,
  formatDayLabel,
  wallClock,
  weekdayColumn,
  weekdayOf,
} from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";
import {
  itemKey,
  studentWeekQuery,
  weekStartParam,
  type StudentWeekDay,
  type WeekDueItem,
  type WeekItem,
  type WeekSessionItem,
} from "../../studentWeek";
import { addDays, mondayOf } from "../../week";

const COLUMN = "mx-auto flex w-full max-w-205 flex-col gap-4.5";
const ITEM = "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left";

/** The skeleton's rows, as R8's states page draws them: four days, one with two items. */
const SKELETON = [["58%"], ["46%"], ["66%", "52%"], ["54%"]] as const;

function sessionMeta(item: WeekSessionItem, t: TFunction): string {
  if (item.cancelled) return t("student.week.cancelled");
  if (item.note !== null) return item.note;
  const minutes = t("student.week.minutes", { minutes: item.durationMinutes });
  return item.room === null ? minutes : `${item.room} · ${minutes}`;
}

function dueMeta(item: WeekDueItem, today: boolean, t: TFunction): string {
  const when = today ? t("student.week.closesToday") : t("student.week.due");
  if (item.state === "in_progress") return `${when} · ${t("student.week.inProgress")}`;
  if (item.durationMinutes === null) return when;
  return `${when} · ${t("student.week.testMinutes", { minutes: item.durationMinutes })}`;
}

function Row({
  item,
  today,
  zone,
}: Readonly<{ item: WeekItem; today: string; zone: string }>) {
  const { t } = useTranslation();
  const due = item.kind === "due";
  const at = wallClock(due ? item.closesAt : item.startsAt, zone);
  const cancelled = item.kind === "session" && item.cancelled;
  const Icon: LucideIcon = due ? FileText : Users;
  const body = (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4.25 flex-none",
          due ? "text-warning-ink" : "text-muted-fg",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-base font-medium text-pretty",
            cancelled && "text-muted-fg line-through",
          )}
        >
          {due ? item.title : item.className}
        </span>{" "}
        <span className="text-muted-fg text-meta block">
          {due ? dueMeta(item, at.date === today, t) : sessionMeta(item, t)}
        </span>
      </span>{" "}
      <span className="text-muted-fg text-sm whitespace-nowrap tabular-nums">
        {formatClock(at.minutes)}
      </span>
    </>
  );
  let tone = "bg-card";
  if (due) tone = "bg-warning-soft";
  else if (cancelled) tone = "bg-muted";
  if (cancelled)
    return (
      <li data-kind="session" data-cancelled="" className={cn(ITEM, tone)}>
        {body}
      </li>
    );
  return (
    <li className="flex">
      <Link
        to={due ? `/assignments/${item.assignmentId}` : "/classes"}
        data-kind={item.kind}
        className={cn(ITEM, tone, "hover:border-ring w-full min-w-0")}
      >
        {body}
      </Link>
    </li>
  );
}

/** Day is one row of the week: the weekday over the date in its circle, then the day's items. */
function Day({
  day,
  today,
  zone,
}: Readonly<{ day: StudentWeekDay; today: string; zone: string }>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const isToday = day.date === today;
  return (
    <section className="flex gap-3.5" data-date={day.date}>
      <h2 className="sr-only" aria-current={isToday ? "date" : undefined}>
        {formatDayLabel(day.date, locale)}
      </h2>
      <span
        aria-hidden="true"
        className="flex w-12 flex-none flex-col items-center pt-1"
      >
        <span
          className={cn(
            "text-caption font-semibold uppercase",
            isToday ? "text-fg" : "text-muted-fg",
          )}
        >
          {weekdayColumn(weekdayOf(day.date), locale)}
        </span>
        <span
          data-slot="day-number"
          className={cn(
            "text-title grid size-9 flex-none place-items-center rounded-full font-semibold",
            isToday ? "bg-primary text-primary-fg" : "text-fg",
          )}
        >
          {Number(day.date.slice(8))}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col pb-1.5">
        {day.items.length === 0 ? (
          <p className="text-muted-fg py-2.5 text-sm">{t("student.week.dayEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {day.items.map((item) => (
              <Row key={itemKey(item)} item={item} today={today} zone={zone} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WeekSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-label={t("common.loading")}
      className="flex flex-col gap-4.5"
    >
      {SKELETON.map((widths) => (
        <div key={widths.join()} className="flex gap-3.5">
          <span className="flex w-12 flex-none flex-col items-center gap-1.5 pt-1">
            <Skeleton className="h-2.5 w-6.5" />
            <Skeleton className="size-9 rounded-full" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {widths.map((width) => (
              <div
                key={width}
                className="flex items-center gap-3 rounded-xl border p-3.5"
              >
                <Skeleton className="size-4.5 flex-none rounded-sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.75">
                  <Skeleton className="h-3" style={{ width }} />
                  <Skeleton className="h-2.5 w-[32%]" />
                </span>
                <Skeleton className="h-2.75 w-8.5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Notice is the page's one sentence, with "Thử lại" when the week could not load. */
function Notice({
  children,
  action,
}: Readonly<{ children: string; action?: ReactNode }>) {
  return (
    <div className="bg-card rounded-xl border border-dashed">
      <div className="flex flex-col items-center gap-3 px-4.5 py-9 text-center">
        <p className="text-muted-fg text-ui max-w-[44ch] text-pretty">{children}</p>
        {action}
      </div>
    </div>
  );
}

/**
 * ThisWeekPage is the student's week (T-R8.15, the deck's `schedule`, DG-81):
 * a detail screen whose way back is Classes, at most 820px wide, headed "Tuần
 * này" over "Lớp học và hạn nộp bài, 22 – 28 tháng 9.". Each day is a row: the
 * weekday over the date in a circle, filled for today, then its sessions and
 * the tests that close that day, or "Không có lịch". A session is its class,
 * its room and length, or the date's note in their place, and its start; it
 * opens Classes, as the deck's does. A cancelled one stays in its day, muted,
 * struck through and reading "Đã huỷ", and opens nothing (R8's states page).
 * A test is tinted amber, says whether it closes today, is under way or how
 * long it lasts, and opens its intro.
 *
 * The deck draws no way to another week, so there is none; `?start=` names
 * one for a link. The heading is there at once; while the week loads, rows of
 * its shape stand in; a week with nothing at all is one sentence; a week
 * that cannot load says so with "Thử lại", and one that has loaded stays when
 * a later read fails. Below 768px the shell's bar carries the title and the
 * back arrow (`handle.detail`), so the page draws its own only from 768.
 */
export default function ThisWeekPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const zone = useDisplayTimeZone();
  const minute = useMinute(true);
  const today = wallClock(new Date(minute * 60_000), zone).date;
  const wide = useMediaQuery("(min-width: 768px)");
  const [params] = useSearchParams();
  const start = weekStartParam(params.get("start"));
  const week = useQuery(studentWeekQuery(start));

  const monday = week.data?.start ?? mondayOf(start ?? today);
  const sunday = week.data?.end ?? addDays(monday, 6);
  const range = formatDateRange(monday, sunday, locale);

  let body: ReactNode;
  if (week.data !== undefined) {
    const days = week.data.days;
    body = days.every((day) => day.items.length === 0) ? (
      <Notice>{t("student.week.empty")}</Notice>
    ) : (
      days.map((day) => <Day key={day.date} day={day} today={today} zone={zone} />)
    );
  } else if (week.isError) {
    body = (
      <div role="alert">
        <Notice
          action={
            <Button
              variant="outline"
              className="bg-card max-[767px]:h-11"
              onClick={() => void week.refetch()}
            >
              <RotateCw aria-hidden="true" className="size-3.5" />
              {t("common.retry")}
            </Button>
          }
        >
          {t("student.week.failed")}
        </Notice>
      </div>
    );
  } else body = <WeekSkeleton />;

  return (
    <div className={COLUMN}>
      <div>
        {wide && (
          <Link
            to="/classes"
            className="text-muted-fg hover:text-fg mb-2 inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            {t("student.classesNav")}
          </Link>
        )}
        <h1 className="text-stat min-[768px]:text-h1-student font-semibold tracking-[-0.02em]">
          {t("student.week.title")}
        </h1>
        <p className="text-muted-fg mt-1 text-base">
          {t("student.week.lead", { range })}
        </p>
      </div>
      {body}
    </div>
  );
}
