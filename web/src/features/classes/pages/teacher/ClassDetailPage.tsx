import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ClipboardList, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadError } from "@/components/shared/ListState";
import { StickyAside } from "@/components/shared/StickyAside";
import {
  latestSessionQuery,
  type AttendanceSessionList,
} from "@/features/attendance/api";
import { ClassAttendance } from "@/features/attendance/components/Register";
import { useCan } from "@/features/auth/permissions";
import { fetchClass } from "@/features/classes/api";
import { AddMemberDialog } from "@/features/classes/components/AddMemberDialog";
import { ClassAssignmentsCard } from "@/features/classes/components/ClassAssignmentsCard";
import { ClassMembersCard } from "@/features/classes/components/ClassMembersCard";
import { ClassSettingsCard } from "@/features/classes/components/ClassSettingsCard";
import { JoinCodePanel } from "@/features/classes/components/JoinCodePanel";
import { JoinCodesOffCallout } from "@/features/classes/components/JoinCodesOffCallout";
import { PageHead } from "@/layouts/shell/PageHead";
import { useContentWidthAtLeast } from "@/layouts/shell/contentWidth";
import { ApiError } from "@/lib/api/errors";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { cn } from "@/lib/utils";

const TWO_COLUMNS = 1000;

/**
 * ClassDetailPage is one class, as the deck's Class detail draws it: back to
 * Classes, the name with its student count, Add student and Assign to class;
 * then, side by side from 1000px of content (two thirds and one third), the
 * members and the class's assignments, and the join code and the class's own
 * words, which stick as the page scrolls. Writing anything needs `teaching.classes.write`; without it the
 * page reads. A class that is missing, or another teacher's, is not found;
 * any other failure keeps the plain "Class" heading above a load error.
 *
 * With `teaching.attendance` the page has two underlined tabs under its
 * header (R8, `74d` V-15): Overview, which is the page above, and
 * Attendance, the register of a session (`?tab=attendance`, with
 * `?session=` naming one; without it the latest). Attendance carries a
 * badge with the class's sessions that have no register, hidden at none.
 */
export default function ClassDetailPage() {
  useDisplayTimeZone();
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const canWrite = useCan("teaching.classes.write");
  const canAssign = useCan("teaching.assignments.write");
  const canAttend = useCan("teaching.attendance");
  const two = useContentWidthAtLeast(TWO_COLUMNS);
  const latest = useQuery({ ...latestSessionQuery(id), enabled: canAttend });
  const addButton = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);
  const klass = useQuery({
    queryKey: ["teacher-class", id],
    queryFn: ({ signal }) => fetchClass(id, signal),
  });

  if (klass.isPending) return <DetailSkeleton />;
  if (klass.isError) {
    const missing = klass.error instanceof ApiError && klass.error.status === 404;
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <PageHead
          title={t(missing ? "classDetail.notFoundTitle" : "classDetail.crumb")}
          back={{ to: "/teacher/classes", label: t("teacherShell.nav.classes") }}
        />
        {missing ? (
          <p className="text-muted-fg text-sm">{t("classDetail.notFound")}</p>
        ) : (
          <LoadError error={klass.error} onRetry={() => void klass.refetch()}>
            {t("classDetail.loadFailed")}
          </LoadError>
        )}
      </div>
    );
  }

  const data = klass.data;
  const overview = (
    <>
      <JoinCodesOffCallout />

      <div
        className={cn(
          "grid items-start gap-4.5",
          two && "grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-4.5">
          <ClassMembersCard klass={data} canWrite={canWrite} />
          <ClassAssignmentsCard classId={data.id} />
        </div>
        <StickyAside
          as="div"
          docked={two}
          className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-4.5"
        >
          <JoinCodePanel klass={data} canWrite={canWrite} />
          <ClassSettingsCard klass={data} canWrite={canWrite} />
        </StickyAside>
      </div>
    </>
  );
  return (
    <div className="flex w-full min-w-0 flex-col gap-4.5">
      <PageHead
        title={data.name}
        crumb
        back={{ to: "/teacher/classes", label: t("teacherShell.nav.classes") }}
        status={
          <span className="bg-muted inline-flex h-5.5 items-center rounded-full px-2.25 text-xs font-medium whitespace-nowrap">
            {t("classDetail.studentCount", { count: data.studentCount })}
          </span>
        }
        actions={
          <>
            {canWrite ? (
              <Button ref={addButton} variant="outline" onClick={() => setAdding(true)}>
                <UserPlus aria-hidden="true" />
                {t("classDetail.addStudent")}
              </Button>
            ) : null}
            {canAssign && data.archivedAt === null ? (
              <Button asChild>
                <Link to={`/teacher/assignments/new?class=${data.id}`}>
                  <ClipboardList aria-hidden="true" />
                  {t("classDetail.assignToClass")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {canAttend ? (
        <ClassTabs classId={data.id} latest={latest}>
          {overview}
        </ClassTabs>
      ) : (
        overview
      )}

      <AddMemberDialog
        klass={data}
        open={adding}
        onOpenChange={setAdding}
        returnFocus={addButton}
      />
    </div>
  );
}

/**
 * ClassTabs puts Overview (`children`) and Attendance under the class's
 * header as underlined tabs, the tab in the address (`?tab=attendance`, and
 * `?session=` for the register's session). Attendance carries the class's
 * sessions with no register, from `latest`, as an accent count.
 */
function ClassTabs({
  classId,
  latest,
  children,
}: Readonly<{
  classId: string;
  latest: UseQueryResult<AttendanceSessionList>;
  children: ReactNode;
}>) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const tab = search.get("tab") === "attendance" ? "attendance" : "overview";
  const notMarked = latest.data?.notMarked ?? 0;
  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        void navigate(
          {
            pathname: location.pathname,
            search: value === "attendance" ? "?tab=attendance" : "",
          },
          { replace: true },
        )
      }
      className="flex flex-col gap-4.5"
    >
      <TabsList aria-label={t("classDetail.tabs.label")}>
        <TabsTrigger value="overview">{t("classDetail.tabs.overview")}</TabsTrigger>
        <TabsTrigger
          value="attendance"
          aria-label={
            notMarked > 0
              ? t("classDetail.tabs.attendanceNotMarked", { count: notMarked })
              : undefined
          }
        >
          {t("classDetail.tabs.attendance")}
          {notMarked > 0 ? (
            <Badge variant="count-brand" aria-hidden="true">
              {notMarked}
            </Badge>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="flex flex-col gap-4.5">
        {children}
      </TabsContent>
      <TabsContent value="attendance">
        <ClassAttendance
          classId={classId}
          session={search.get("session")}
          latest={latest}
        />
      </TabsContent>
    </Tabs>
  );
}

function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("common.loading")}
      className="flex w-full flex-col gap-4.5"
    >
      <Skeleton className="h-14 w-72 rounded-lg" />
      <div className="grid gap-4.5 min-[1280px]:grid-cols-[2fr_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
