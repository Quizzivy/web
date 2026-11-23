import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/features/auth/permissions";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMinute } from "@/hooks/useTick";
import { useContentWidthAtLeast } from "@/layouts/shell/contentWidth";
import { PageHead } from "@/layouts/shell/PageHead";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { formatDateRange, wallClock } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";
import { calendarQuery, type ClassSession } from "../../api";
import { Agenda, AgendaSkeleton } from "../../components/Agenda";
import { agendaDays } from "../../items";
import { Legend } from "../../components/Legend";
import { NewSessionDialog } from "../../components/NewSessionDialog";
import { SessionPopover, type OpenedSession } from "../../components/SessionPopover";
import { WeekGrid } from "../../components/WeekGrid";
import {
  addDays,
  isoWeekOf,
  itemsByDay,
  mondayOf,
  mondayOfIsoWeek,
  weekDays,
} from "../../week";

/**
 * The week is a grid from the deck's 768px of window, the shell's phone
 * breakpoint, while the content area keeps at least 600px for it (seven
 * columns of about 78px, room for a class's name and its time); below
 * either it is the agenda. A 768px window with the sidebar open leaves 464px,
 * where the deck's grid cuts every name to three letters.
 */
const GRID_WINDOW = "(min-width: 768px)";
const GRID_CONTENT = 600;

const NAV_BUTTON =
  "text-fg hover:bg-muted grid h-8.5 place-items-center bg-transparent max-[767px]:h-11";

/**
 * Notice is the calendar's one sentence and one action, as R8's states page
 * draws it: over the grid of an empty week (a card), in place of a grid that
 * could not load, and on a phone (a dashed card).
 */
function Notice({
  children,
  action,
  tone,
}: Readonly<{
  children: string;
  action?: ReactNode;
  tone: "card" | "dashed" | "plain";
}>) {
  return (
    <div
      className={cn(
        tone === "card" && "bg-card shadow-card rounded-xl border",
        tone === "dashed" && "bg-card rounded-xl border border-dashed",
      )}
    >
      <div className="flex flex-col items-center gap-3 px-4.5 py-9 text-center">
        <p className="text-muted-fg text-ui max-w-[44ch] text-pretty">{children}</p>
        {action}
      </div>
    </div>
  );
}

/**
 * CalendarPage is the teacher's week (T-R8.10, the deck's `r.calendar`): the
 * week as its heading ("22 – 28 tháng 9"), previous, Today and next, "+ Buổi
 * học" for a teacher who may change classes, the legend, and the week as a
 * grid, or as an agenda on a phone or in a content area too narrow for it. The week is the address's
 * `?week=2026-W39`, weeks starting on Monday; without one it is this week.
 *
 * The week reads once, again when the window regains focus and after a
 * session is added; nothing polls. While it loads the header is there at
 * once and blocks stand where sessions will be; an empty week keeps its grid
 * with the sentence and "+ Buổi học" over it (DG-83); a week that cannot load
 * says so with "Thử lại". A test's opening or closing opens the assignment.
 * A class session opens its popover beside it, or a sheet on a phone
 * (`SessionPopover`, T-R8.11), whose changes read the week again.
 */
export default function CalendarPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const zone = useDisplayTimeZone();
  const minute = useMinute(true);
  const now = wallClock(new Date(minute * 60_000), zone);
  const today = now.date;
  const [params, setParams] = useSearchParams();
  const monday = mondayOfIsoWeek(params.get("week")) ?? mondayOf(today);
  const days = weekDays(monday);
  const from = monday;
  const to = addDays(monday, 7);
  const title = formatDateRange(monday, addDays(monday, 6), locale);
  const canWrite = useCan("teaching.classes.write");
  const roomy = useContentWidthAtLeast(GRID_CONTENT);
  const wide = useMediaQuery(GRID_WINDOW) && roomy;
  const week = useQuery(calendarQuery(from, to));
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<OpenedSession | null>(null);
  const openSession = (session: ClassSession, anchor: HTMLElement) =>
    setOpened({ session, anchor });
  const addButton = useRef<HTMLButtonElement>(null);
  const emptyAdd = useRef<HTMLButtonElement>(null);
  const [returnTo, setReturnTo] = useState<"header" | "empty">("header");

  const items = week.data ? itemsByDay(week.data, days, zone) : days.map(() => []);

  function showWeek(date: string) {
    setOpened(null);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (mondayOf(date) === mondayOf(today)) next.delete("week");
        else next.set("week", isoWeekOf(date));
        return next;
      },
      { preventScrollReset: true },
    );
  }

  function openNew(from: "header" | "empty") {
    setReturnTo(from);
    setAdding(true);
  }

  function created(session: ClassSession) {
    const date = wallClock(session.startsAt, zone).date;
    if (!days.includes(date)) showWeek(date);
  }

  const addAction = (from: "header" | "empty") =>
    canWrite ? (
      <Button
        ref={from === "header" ? addButton : emptyAdd}
        variant={from === "header" ? "default" : "outline"}
        className={cn("max-[767px]:h-11", from === "empty" && "bg-card")}
        onClick={() => openNew(from)}
      >
        <Plus aria-hidden="true" />
        {t("calendar.addSession")}
      </Button>
    ) : undefined;

  const empty =
    week.data !== undefined &&
    week.data.sessions.length === 0 &&
    week.data.assignmentEvents.length === 0;

  const retry = (
    <Button
      variant="outline"
      className="bg-card max-[767px]:h-11"
      onClick={() => void week.refetch()}
    >
      <RotateCw aria-hidden="true" />
      {t("common.retry")}
    </Button>
  );

  let body: ReactNode;
  if (week.isError && week.data === undefined)
    body = (
      <div role="alert">
        <Notice tone={wide ? "card" : "dashed"} action={retry}>
          {t("calendar.failed")}
        </Notice>
      </div>
    );
  else if (wide)
    body = (
      <WeekGrid
        label={title}
        days={days}
        today={today}
        nowMinutes={now.minutes}
        items={items}
        loading={week.isPending}
        onOpenSession={openSession}
        openId={opened?.session.id}
        overlay={
          empty ? (
            <Notice tone="card" action={addAction("empty")}>
              {t("calendar.empty")}
            </Notice>
          ) : undefined
        }
      />
    );
  else if (week.isPending) body = <AgendaSkeleton />;
  else if (empty)
    body = (
      <Notice tone="dashed" action={addAction("empty")}>
        {t("calendar.empty")}
      </Notice>
    );
  else
    body = (
      <Agenda
        days={agendaDays(days, items, today)}
        today={today}
        onOpenSession={openSession}
        openId={opened?.session.id}
      />
    );

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 min-[768px]:gap-4">
      <PageHead
        title={title}
        className="items-center"
        actions={
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label={t("calendar.weekNav")}
              className="bg-card flex overflow-hidden rounded-md border"
            >
              <button
                type="button"
                aria-label={t("calendar.previousWeek")}
                className={cn(NAV_BUTTON, "w-8.5 max-[767px]:w-11")}
                onClick={() => showWeek(addDays(monday, -7))}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                className={cn(NAV_BUTTON, "border-x px-3 text-sm font-medium")}
                onClick={() => showWeek(today)}
              >
                {t("calendar.today")}
              </button>
              <button
                type="button"
                aria-label={t("calendar.nextWeek")}
                className={cn(NAV_BUTTON, "w-8.5 max-[767px]:w-11")}
                onClick={() => showWeek(addDays(monday, 7))}
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>
            {addAction("header")}
          </div>
        }
      />
      <Legend />
      {body}
      <SessionPopover
        opened={opened}
        today={today}
        sheet={!wide}
        onClose={() => setOpened(null)}
      />
      {canWrite && (
        <NewSessionDialog
          open={adding}
          onOpenChange={setAdding}
          today={today}
          terms={week.data?.terms ?? []}
          termsFrom={from}
          onCreated={created}
          returnFocus={returnTo === "header" ? addButton : emptyAdd}
        />
      )}
    </div>
  );
}
