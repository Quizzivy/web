import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/shared/ListState";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { SessionRow } from "@/features/attendance/components/SessionRow";
import { useSessionPages } from "@/features/attendance/api";
import { startOfDay, weekBefore } from "@/features/attendance/dates";
import { PageHead } from "@/layouts/shell/PageHead";
import { getDisplayTimeZone, useDisplayTimeZone } from "@/lib/i18n/datetime";
import { formatDayLabel, wallClock } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";

type Pages = ReturnType<typeof useSessionPages>;

/**
 * AttendancePage is the cross-class list of sessions the deck draws (v2,
 * `74d` V-18): the sessions that have started today, the past ones with no
 * register, and those saved in the last seven days, each in its own card,
 * which stays with its sentence when it has nothing to list. Today's card
 * lists a session only once it has started (O-R8.6), as the list does. A row
 * opens the class's Attendance tab on its session.
 */
export default function AttendancePage() {
  useDisplayTimeZone();
  const { t } = useTranslation();
  const locale = useLocale();
  const [now] = useState(() => new Date());
  const midnight = startOfDay(now).toISOString();
  const today = useSessionPages(["today", midnight], { since: midnight });
  const owed = useSessionPages(["owed", midnight], { before: midnight, marked: false });
  const recent = useSessionPages(["recent", midnight], {
    since: weekBefore(new Date(midnight)).toISOString(),
    before: midnight,
    marked: true,
  });
  const failed = [today, owed, recent].find((list) => list.isError);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHead title={t("attendance.title")} description={t("attendance.lead")} />
      {failed === undefined ? (
        <>
          <SessionCard
            title={t("attendance.todayTitle", {
              date: formatDayLabel(wallClock(now, getDisplayTimeZone()).date, locale),
            })}
            sub={
              today.isPending
                ? ""
                : t("attendance.classes", { count: today.items.length })
            }
            empty={t("attendance.empty.today")}
            list={today}
            now={now}
          />
          <SessionCard
            title={t("attendance.owedTitle")}
            sub={t("attendance.owedSub")}
            empty={t("attendance.empty.owed")}
            list={owed}
            now={now}
          />
          <SessionCard
            title={t("attendance.recentTitle")}
            sub={t("attendance.recentSub")}
            empty={t("attendance.empty.recent")}
            list={recent}
            now={now}
          />
        </>
      ) : (
        <LoadError
          error={failed.error}
          onRetry={() => {
            for (const list of [today, owed, recent])
              if (list.isError) void list.refetch();
          }}
        >
          {t("attendance.pageFailed")}
        </LoadError>
      )}
    </div>
  );
}

const SKELETON_WIDTHS = ["w-[44%]", "w-1/2"] as const;

/**
 * SessionCard is one of the page's three cards: its title and the line that
 * says what it holds, then its sessions, blocks while they load, or its
 * sentence when there is none.
 */
function SessionCard({
  title,
  sub,
  empty,
  list,
  now,
}: Readonly<{ title: string; sub: string; empty: string; list: Pages; now: Date }>) {
  const { t } = useTranslation();
  return (
    <Card asChild className="gap-0 overflow-hidden py-0">
      <section aria-label={title}>
        <div className="flex flex-wrap items-baseline justify-between gap-2.5 px-4 py-3.5">
          <h2 className="text-md font-semibold">{title}</h2>
          {sub === "" ? null : <span className="text-muted-fg text-meta">{sub}</span>}
        </div>
        {list.isPending ? (
          <div role="status" aria-label={t("common.loading")}>
            {SKELETON_WIDTHS.map((width) => (
              <div key={width} className="flex items-center gap-4 border-t px-4 py-3.5">
                <span className="flex w-24 flex-none flex-col gap-1.5">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-2.5 w-13" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className={`h-3 ${width}`} />
                  <Skeleton className="h-2.5 w-[30%]" />
                </span>
                <Skeleton className="h-5.5 w-24" />
              </div>
            ))}
          </div>
        ) : null}
        {!list.isPending && list.items.length === 0 ? (
          <p className="text-muted-fg text-ui border-t px-4 py-4.5">{empty}</p>
        ) : null}
        {list.items.length > 0 ? (
          <ul>
            {list.items.map((session) => (
              <SessionRow key={session.id} session={session} now={now} />
            ))}
            <LoadMoreSentinel
              as="li"
              active={list.hasMore}
              loading={list.loadingMore}
              onVisible={list.loadMore}
            />
          </ul>
        ) : null}
      </section>
    </Card>
  );
}
