import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatClock,
  formatDayLabel,
  weekdayColumn,
  weekdayOf,
} from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";
import {
  HOUR_PX,
  eventBox,
  hourRange,
  lanes,
  nowTop,
  type CalendarItem,
} from "../week";
import type { OpenSession } from "../items";
import { CalendarEvent } from "./CalendarEvent";

/** The deck's loading blocks, [day, start hour, hours]: where a usual week's sessions stand. */
const LOADING_BLOCKS = [
  [0, 18, 1.5],
  [1, 17.5, 1.5],
  [2, 18, 1.5],
  [3, 17.5, 1.5],
  [4, 18, 1.5],
  [5, 9, 2],
  [6, 9, 2],
] as const;

const COLUMNS = "grid grid-cols-[56px_repeat(7,minmax(0,1fr))]";

/**
 * WeekGrid is the deck's week (T-R8.10): a card at most 600px high that
 * scrolls, a 56px hour gutter and seven day columns under a sticky header of
 * day names and dates. The body starts 10px under the header, so the 08:00
 * label is never under it (drawing 5). Hour rows are 44px from 08:00 to
 * 22:00, grown to whole hours for any event the week holds outside them.
 * Today's header is tinted and its date in the accent's ink; the weekend's
 * columns are on the sidebar's ground; today's column carries the red
 * now-line with its dot, which moves without a transition for a reader who
 * asks for reduced motion.
 *
 * `items` are the week's, by day (`itemsByDay`); while `loading` the grid
 * draws blocks where sessions will be instead, and `overlay` sits over an
 * empty week.
 */
export function WeekGrid({
  days,
  today,
  nowMinutes,
  items,
  loading = false,
  overlay,
  onOpenSession,
  openId,
  label,
}: Readonly<{
  days: readonly string[];
  today: string;
  nowMinutes: number;
  items: readonly (readonly CalendarItem[])[];
  loading?: boolean;
  overlay?: ReactNode;
  onOpenSession?: OpenSession | undefined;
  /** The session whose popover is open, which its block marks. */
  openId?: string | undefined;
  label: string;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const range = hourRange(items.flat().map((item) => item.span));
  const hours = Array.from(
    { length: range.last - range.first },
    (_, index) => range.first + index,
  );
  const height = hours.length * HOUR_PX;
  const line = nowTop(nowMinutes, range);
  return (
    <section
      aria-label={label}
      aria-busy={loading || undefined}
      className="bg-card shadow-card overflow-hidden rounded-xl border"
    >
      <div
        data-slot="week-scroller"
        className="relative max-h-[600px] [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto"
      >
        <div
          aria-hidden="true"
          className={cn(COLUMNS, "bg-card sticky top-0 z-3 border-b")}
        >
          <span />
          {days.map((day) => {
            const isToday = day === today;
            return (
              <div
                key={day}
                data-today={isToday || undefined}
                className={cn(
                  "border-l px-2 py-2.5 text-center",
                  isToday && "bg-brand-soft",
                )}
              >
                <div className="text-muted-fg text-xs leading-normal">
                  {weekdayColumn(weekdayOf(day), locale)}
                </div>
                <div
                  className={cn(
                    "text-stat-sm leading-normal font-semibold tabular-nums",
                    isToday ? "text-brand-ink" : "text-fg",
                  )}
                >
                  {Number(day.slice(8))}
                </div>
              </div>
            );
          })}
        </div>
        <div className={cn(COLUMNS, "relative pt-2.5")}>
          <div aria-hidden="true">
            {hours.map((hour) => (
              <div
                key={hour}
                className="text-muted-fg text-caption h-11 -translate-y-[7px] px-2 text-right tabular-nums"
              >
                {formatClock(hour * 60)}
              </div>
            ))}
          </div>
          {days.map((day, index) => {
            const dayItems = items[index] ?? [];
            const placed = lanes(dayItems.map((item) => item.span));
            const weekend = index >= 5;
            return (
              <div
                key={day}
                role="group"
                aria-label={formatDayLabel(day, locale)}
                {...(day === today ? { "aria-current": "date" as const } : {})}
                className={cn("relative border-l", weekend && "bg-sidebar")}
                style={{ height }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    aria-hidden="true"
                    className="h-11 border-t opacity-60"
                  />
                ))}
                {loading
                  ? LOADING_BLOCKS.filter(([column]) => column === index).map(
                      ([, start, length]) => {
                        const box = eventBox(
                          { start: start * 60, minutes: length * 60 },
                          range.first,
                        );
                        return (
                          <Skeleton
                            key={start}
                            className="absolute right-1 left-1 rounded-sm"
                            style={{ top: box.top, height: box.height }}
                          />
                        );
                      },
                    )
                  : dayItems.map((item, position) => (
                      <CalendarEvent
                        key={item.key}
                        item={item}
                        box={eventBox(item.span, range.first)}
                        lane={placed[position]!}
                        onOpenSession={onOpenSession}
                        open={item.kind === "session" && item.session.id === openId}
                      />
                    ))}
                {day === today && line !== null && (
                  <div
                    aria-hidden="true"
                    data-slot="now-line"
                    className="bg-danger absolute right-0 left-0 z-2 h-0.5 motion-safe:transition-[top] motion-safe:duration-500"
                    style={{ top: line }}
                  >
                    <span className="bg-danger absolute -top-0.75 -left-1 size-2 rounded-full" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {loading && (
          <span role="status" className="sr-only">
            {t("common.loading")}
          </span>
        )}
        {overlay !== undefined && (
          <div className="absolute top-[150px] right-0 left-14 z-4 flex justify-center px-4">
            {overlay}
          </div>
        )}
      </div>
    </section>
  );
}
