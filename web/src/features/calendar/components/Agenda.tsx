import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { TFunction } from "i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock, formatDayLabel, formatTimeRange } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "../week";
import {
  assignmentHref,
  itemTitle,
  toneOf,
  type AgendaDay,
  type OpenSession,
} from "../items";

function second(item: CalendarItem, t: TFunction): string {
  if (item.kind !== "session") return t("calendar.testWindow");
  if (item.session.cancelled) return t("calendar.event.cancelled");
  return formatTimeRange(item.span.start, item.span.minutes);
}

const ROW =
  "flex w-full gap-3 px-3.5 py-3 text-left hover:bg-muted focus-visible:-outline-offset-2";

function Row({
  item,
  first,
  onOpenSession,
}: Readonly<{
  item: CalendarItem;
  first: boolean;
  onOpenSession?: OpenSession | undefined;
}>) {
  const { t } = useTranslation();
  const cancelled = item.kind === "session" && item.session.cancelled;
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn("w-[3px] flex-none rounded-[3px]", toneOf(item).bar)}
      />
      <span className="text-muted-fg text-meta w-11 flex-none tabular-nums">
        {formatClock(item.span.start)}
      </span>{" "}
      <span className="text-ui min-w-0 flex-1 font-medium">
        <span className={cn("block", cancelled && "text-muted-fg line-through")}>
          {itemTitle(item, t)}
        </span>{" "}
        <span className="text-muted-fg block text-xs font-normal">
          {second(item, t)}
        </span>
      </span>
    </>
  );
  const className = cn(ROW, !first && "border-t");
  const href = assignmentHref(item);
  return (
    <li>
      {href === null ? (
        <button
          type="button"
          data-kind="session"
          className={cn(className, "cursor-pointer")}
          onClick={(event) => {
            if (item.kind === "session")
              onOpenSession?.(item.session, event.currentTarget);
          }}
        >
          {body}
        </button>
      ) : (
        <Link to={href} data-kind={item.kind} className={className}>
          {body}
        </Link>
      )}
    </li>
  );
}

/**
 * Agenda is the week below 768px, as the deck draws it: a list of days, each
 * headed "Hôm nay · Th 4, 24 thg 9" (today, in the accent's ink) or by its
 * date, over a card of rows. A row is a 3px bar in its kind's colour, the
 * start, then the title over its time range, or "Khung làm bài" for a test.
 */
export function Agenda({
  days,
  today,
  onOpenSession,
}: Readonly<{
  days: readonly AgendaDay[];
  today: string;
  onOpenSession?: OpenSession | undefined;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3.5">
      {days.map((day) => {
        const isToday = day.date === today;
        const label = formatDayLabel(day.date, locale);
        return (
          <section key={day.date}>
            <h2
              className={cn(
                "text-meta mb-1.5 font-semibold",
                isToday ? "text-brand-ink" : "text-muted-fg",
              )}
            >
              {isToday ? t("calendar.agendaToday", { day: label }) : label}
            </h2>
            <ul className="bg-card overflow-hidden rounded-xl border">
              {day.items.map((item, index) => (
                <Row
                  key={item.key}
                  item={item}
                  first={index === 0}
                  onOpenSession={onOpenSession}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** AgendaSkeleton is the agenda while the week loads: three days of the agenda's own shape. */
export function AgendaSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-label={t("common.loading")}
      className="flex flex-col gap-3.5"
    >
      {[0, 1, 2].map((day) => (
        <div key={day} className="flex flex-col gap-1.5">
          <Skeleton className="h-2.75 w-[38%]" />
          <div className="bg-card flex flex-col gap-2 rounded-xl border p-3.5">
            <Skeleton className="h-3 w-[62%]" />
            <Skeleton className="h-2.5 w-[34%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
