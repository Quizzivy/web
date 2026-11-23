import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link, useBlocker, useLocation, useNavigate } from "react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  CalendarDays,
  CalendarX,
  CheckCheck,
  Clock,
  MessageSquareText,
  Plus,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { BulkActions, BulkBarButton } from "@/components/shared/BulkActions";
import { BulkSelectAll, BulkSelectRow } from "@/components/shared/BulkSelection";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DirtyBar } from "@/components/shared/DirtyBar";
import { EmptyState, LoadError } from "@/components/shared/ListState";
import { SearchInput, TOOLBAR_SEARCH } from "@/components/shared/SearchInput";
import { NoteDialog } from "@/features/attendance/components/NoteDialog";
import { ProgressRow } from "@/features/attendance/components/ProgressRow";
import {
  SessionChip,
  type SessionState,
} from "@/features/attendance/components/SessionChip";
import { SessionPicker } from "@/features/attendance/components/SessionPicker";
import { StatusRadio } from "@/features/attendance/components/StatusRadio";
import {
  registerQuery,
  useSaveRegister,
  type AttendanceSessionList,
  type AttendanceStatus,
  type AttendanceStudent,
  type SessionAttendance,
} from "@/features/attendance/api";
import { isToday, notOpenYet, sessionLabel } from "@/features/attendance/dates";
import {
  changedStudents,
  countsOf,
  markOf,
  marksToSave,
  restPresent,
  shownStudents,
  withMarks,
  withNote,
  type Edits,
  type Filter,
} from "@/features/attendance/register";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useContentWidthAtLeast } from "@/layouts/shell/contentWidth";
import { ApiError } from "@/lib/api/errors";
import { getDisplayTimeZone } from "@/lib/i18n/datetime";
import { formatClock, wallClock } from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";

/** RATE_FLOOR is the rate under which a student's rate reads in the danger ink. */
const RATE_FLOOR = 80;
/** RATE_FROM is the content width from which a row shows the student's rate. */
const RATE_FROM = 640;
/** HEAD_FROM is the content width from which the header names every column. */
const HEAD_FROM = 760;

const NO_EDITS: Edits = new Map();

type Row = { id: string; student: AttendanceStudent };
type Selection = ReturnType<typeof useBulkSelection<Row>>;

/**
 * ClassAttendance is the Attendance tab of a class (v2, `74d` V-17): the
 * register of the session `?session=` names, else of the class's latest
 * started session, which `latest` (the class's `limit=1` list) gives. A class
 * with no started session gets one sentence and a link to the calendar.
 */
export function ClassAttendance({
  classId,
  session,
  latest,
}: Readonly<{
  classId: string;
  session: string | null;
  latest: UseQueryResult<AttendanceSessionList>;
}>) {
  const { t } = useTranslation();
  const latestId = latest.data?.items[0]?.id ?? null;
  if (session === null) {
    if (latest.isPending) return <RegisterSkeleton />;
    if (latest.isError)
      return (
        <LoadError error={latest.error} onRetry={() => void latest.refetch()}>
          {t("attendance.registerFailed")}
        </LoadError>
      );
    if (latestId === null)
      return (
        <EmptyState
          action={
            <Button variant="outline" asChild>
              <Link to="/teacher/calendar">
                <CalendarDays aria-hidden="true" />
                {t("attendance.addInCalendar")}
              </Link>
            </Button>
          }
        >
          {t("attendance.noSessions")}
        </EmptyState>
      );
  }
  const sessionId = session ?? latestId ?? "";
  return (
    <SessionRegister
      key={sessionId}
      classId={classId}
      sessionId={sessionId}
      defaultId={latestId}
    />
  );
}

/**
 * useLeaveGuard asks before a navigation drops the register's unsaved marks:
 * one that leaves the page, the Attendance tab, or the session, which an
 * address without `?session=` names as the class's latest, `defaultId`. A
 * reload or a closed tab gets the browser's own prompt meanwhile.
 */
function useLeaveGuard(dirty: boolean, sessionId: string, defaultId: string | null) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!dirty || nextLocation.pathname === "/login") return false;
    if (nextLocation.pathname !== currentLocation.pathname) return true;
    const next = new URLSearchParams(nextLocation.search);
    if (next.get("tab") !== "attendance") return true;
    return (next.get("session") ?? defaultId) !== sessionId;
  });
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty) blocker.proceed();
  }, [blocker, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return blocker;
}

/** stateOf is where a session's register stands, for its chip. */
function stateOf(register: SessionAttendance, now: Date): SessionState {
  const { session } = register;
  if (session.cancelled) return "cancelled";
  if (session.hasAttendance) return "saved";
  if (notOpenYet(session.startsAt, now)) return "notStarted";
  return isToday(session.startsAt, now) ? "today" : "missing";
}

/** saveFailure is the sentence a refused or failed save shows in its bar. */
function saveFailure(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.code === "SESSION_NOT_STARTED") return t("attendance.notStarted");
    if (error.code === "SESSION_CANCELLED") return t("attendance.cancelled");
  }
  return t("attendance.saveFailed");
}

/**
 * SessionRegister reads one session's register: blocks while it loads, a
 * line when the session is not this class's, Retry when it cannot be read,
 * then the register itself.
 */
function SessionRegister({
  classId,
  sessionId,
  defaultId,
}: Readonly<{ classId: string; sessionId: string; defaultId: string | null }>) {
  const { t } = useTranslation();
  const register = useQuery(registerQuery(sessionId));
  if (register.isPending) return <RegisterSkeleton />;
  if (register.isError) {
    if (register.error instanceof ApiError && register.error.status === 404)
      return <p className="text-muted-fg text-sm">{t("attendance.sessionMissing")}</p>;
    return (
      <LoadError error={register.error} onRetry={() => void register.refetch()}>
        {t("attendance.registerFailed")}
      </LoadError>
    );
  }
  if (register.data.session.classId !== classId)
    return <p className="text-muted-fg text-sm">{t("attendance.sessionMissing")}</p>;
  return (
    <LoadedRegister
      classId={classId}
      sessionId={sessionId}
      defaultId={defaultId}
      data={register.data}
      reload={() => void register.refetch()}
    />
  );
}

/**
 * useRegisterSave saves the marks that changed: it asks first while
 * students are unmarked (`confirming`), toasts the counts once saved, and
 * keeps the sentence a refused save shows. A session cancelled meanwhile is
 * read again, so the register turns read-only.
 */
function useRegisterSave({
  sessionId,
  students,
  edits,
  unmarked,
  onSaved,
  reload,
}: Readonly<{
  sessionId: string;
  students: readonly AttendanceStudent[];
  edits: Edits;
  unmarked: number;
  onSaved: () => void;
  reload: () => void;
}>) {
  const { t } = useTranslation();
  const save = useSaveRegister(sessionId);
  const [confirming, setConfirming] = useState(false);
  const [savedAt, setSavedAt] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    setError(null);
    save.mutate(marksToSave(students, edits), {
      onSuccess: (saved) => {
        onSaved();
        setSavedAt(formatClock(wallClock(new Date(), getDisplayTimeZone()).minutes));
        toast(
          t("attendance.savedToast", { a: saved.counts.absent, l: saved.counts.late }),
        );
      },
      onError: (cause) => {
        setError(saveFailure(cause, t));
        if (cause instanceof ApiError && cause.code === "SESSION_CANCELLED") reload();
      },
    });
  };
  return {
    pending: save.isPending,
    savedAt,
    error,
    clearError: () => setError(null),
    confirming,
    setConfirming,
    run,
    request: () => {
      if (unmarked > 0) setConfirming(true);
      else run();
    },
  };
}

/**
 * LoadedRegister is one session's register, as the deck draws it: the
 * session picker and its chip, the search and "Mark all present"; then the
 * card with the progress row and its filters, the selection bar, the header,
 * a row per student and the footer; and the sticky bar while marks are not
 * saved. A session that has not started, or a cancelled one, reads only:
 * its line says why, and nothing on it takes a press.
 */
function LoadedRegister({
  classId,
  sessionId,
  defaultId,
  data,
  reload,
}: Readonly<{
  classId: string;
  sessionId: string;
  defaultId: string | null;
  data: SessionAttendance;
  reload: () => void;
}>) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter | null>(null);
  const [noteFor, setNoteFor] = useState<AttendanceStudent | null>(null);
  const selection = useBulkSelection<Row>();
  const searchRef = useRef<HTMLInputElement>(null);
  const noteButton = useRef<HTMLElement | null>(null);
  const students = data.students;
  const changed = changedStudents(students, edits).length;
  const counts = countsOf(students, edits);
  const blocker = useLeaveGuard(changed > 0, sessionId, defaultId);
  const save = useRegisterSave({
    sessionId,
    students,
    edits,
    unmarked: counts.none,
    onSaved: () => {
      setEdits(NO_EDITS);
      selection.clear();
    },
    reload,
  });
  const state = stateOf(data, now);
  const readOnly = state === "cancelled" || state === "notStarted";

  const pick = (next: string) => {
    if (next === sessionId) return;
    const params = new URLSearchParams(location.search);
    params.set("tab", "attendance");
    params.set("session", next);
    void navigate({ pathname: location.pathname, search: params.toString() });
  };
  let dirtyText = t("attendance.dirty", { count: changed });
  if (counts.none > 0)
    dirtyText = `${dirtyText} · ${t("attendance.dirtyUnmarked", { count: counts.none })}`;

  return (
    <div className="flex flex-col gap-4">
      <RegisterTools
        classId={classId}
        sessionId={sessionId}
        startsAt={data.session.startsAt}
        state={state}
        savedAt={save.savedAt}
        now={now}
        onPick={pick}
        search={search}
        onSearch={setSearch}
        searchRef={searchRef}
        markLabel={
          counts.none > 0 && counts.none < students.length
            ? t("attendance.markRest")
            : t("attendance.markAll")
        }
        onMarkAll={
          readOnly || students.length === 0
            ? null
            : () => setEdits(restPresent(students, edits))
        }
      />
      {readOnly ? <ReadOnlyLine cancelled={state === "cancelled"} /> : null}
      <RegisterCard
        data={data}
        edits={edits}
        readOnly={readOnly}
        rows={shownStudents(students, edits, search, filter).map((student) => ({
          id: student.studentId,
          student,
        }))}
        search={search}
        filter={filter}
        onFilter={setFilter}
        selection={selection}
        onMark={(ids, status) => setEdits(withMarks(students, edits, ids, status))}
        onNote={(student, button) => {
          noteButton.current = button;
          setNoteFor(student);
        }}
      />

      <DirtyBar
        dirty={changed > 0}
        saving={save.pending}
        error={save.error}
        message={dirtyText}
        saveLabel={t("attendance.save")}
        onDiscard={() => {
          setEdits(NO_EDITS);
          save.clearError();
        }}
        onSave={save.request}
        returnFocus={() => searchRef.current}
      />

      <NoteDialog
        name={noteFor?.fullName ?? ""}
        note={noteFor === null ? "" : (markOf(noteFor, edits).note ?? "")}
        open={noteFor !== null}
        onOpenChange={(open) => {
          if (!open) setNoteFor(null);
        }}
        onSave={(note) => {
          if (noteFor !== null) setEdits(withNote(noteFor, edits, note));
        }}
        returnFocus={noteButton}
      />

      <ConfirmDialog
        open={save.confirming}
        onOpenChange={save.setConfirming}
        title={t("attendance.unmarked.title", { count: counts.none })}
        description={t("attendance.unmarked.body")}
        confirmLabel={t("attendance.unmarked.confirm")}
        onConfirm={() => {
          save.setConfirming(false);
          save.run();
        }}
      />

      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        title={t("attendance.leave.title")}
        description={t("attendance.leave.body")}
        confirmLabel={t("attendance.leave.confirm")}
        cancelLabel={t("attendance.leave.stay")}
        destructive
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </div>
  );
}

/**
 * RegisterTools is the register's top row: the session picker and the
 * register's chip, then the search and "Mark all present", which a
 * read-only register leaves out (`onMarkAll` null).
 */
function RegisterTools({
  classId,
  sessionId,
  startsAt,
  state,
  savedAt,
  now,
  onPick,
  search,
  onSearch,
  searchRef,
  markLabel,
  onMarkAll,
}: Readonly<{
  classId: string;
  sessionId: string;
  startsAt: string;
  state: SessionState;
  savedAt: string | undefined;
  now: Date;
  onPick: (sessionId: string) => void;
  search: string;
  onSearch: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  markLabel: string;
  onMarkAll: (() => void) | null;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <SessionPicker
          classId={classId}
          current={sessionId}
          label={sessionLabel(startsAt, locale)}
          now={now}
          onPick={onPick}
        />
        <SessionChip state={state} savedAt={savedAt} />
      </div>
      <div className="flex min-w-0 flex-[1_1_240px] items-center justify-end gap-2">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder={t("attendance.search")}
          inputRef={searchRef}
          className={cn(
            TOOLBAR_SEARCH,
            "min-w-27.5 flex-[0_1_240px] [&_input]:h-9 [&_svg]:top-2.5",
          )}
        />
        {onMarkAll === null ? null : (
          <Button variant="outline" onClick={onMarkAll}>
            <CheckCheck aria-hidden="true" />
            {markLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/** ReadOnlyLine says why a register takes no marks: not started yet, or cancelled. */
function ReadOnlyLine({ cancelled }: Readonly<{ cancelled: boolean }>) {
  const { t } = useTranslation();
  const Icon = cancelled ? CalendarX : Clock;
  return (
    <div
      role="status"
      className="bg-muted flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm leading-[1.55]"
    >
      <Icon aria-hidden="true" className="text-muted-fg mt-0.5 size-3.75 flex-none" />
      <span className="min-w-0 flex-1 text-pretty">
        {t(cancelled ? "attendance.cancelled" : "attendance.notStarted")}
      </span>
    </div>
  );
}

/**
 * RegisterCard is the register's card: the progress row and its filters,
 * the selection bar while rows are selected, the header on `--muted`, a row
 * per student shown, or the sentence for none, and the footer. The rate
 * shows from 640px of content and every column's name from 760, as the
 * deck has it.
 */
function RegisterCard({
  data,
  edits,
  readOnly,
  rows,
  search,
  filter,
  onFilter,
  selection,
  onMark,
  onNote,
}: Readonly<{
  data: SessionAttendance;
  edits: Edits;
  readOnly: boolean;
  rows: readonly Row[];
  search: string;
  filter: Filter | null;
  onFilter: (next: Filter | null) => void;
  selection: Selection;
  onMark: (ids: Iterable<string>, status: AttendanceStatus | null) => void;
  onNote: (student: AttendanceStudent, button: HTMLElement) => void;
}>) {
  const { t } = useTranslation();
  const showRate = useContentWidthAtLeast(RATE_FROM);
  const showHead = useContentWidthAtLeast(HEAD_FROM);
  const caption = t(
    data.rateScope === "term" ? "attendance.col.term" : "attendance.col.overall",
  );
  const markSelected = (status: AttendanceStatus) => {
    onMark(selection.selected.keys(), status);
    selection.clear();
  };
  const query = search.trim();
  return (
    <Card asChild className="gap-0 overflow-hidden py-0">
      <section aria-label={t("attendance.registerLabel")}>
        <ProgressRow
          counts={countsOf(data.students, edits)}
          total={data.students.length}
          filter={filter}
          onFilter={onFilter}
        />
        {readOnly ? null : (
          <BulkActions
            selected={[...selection.selected.values()]}
            name={(row) => row.student.fullName}
            actions={[]}
            onRemoved={() => undefined}
            onClear={selection.clear}
            onSettled={() => Promise.resolve()}
            className="mx-3 my-2.5"
          >
            {(["present", "late", "absent"] as const).map((status) => (
              <BulkBarButton key={status} onClick={() => markSelected(status)}>
                {t(`attendance.mark.${status}`)}
              </BulkBarButton>
            ))}
          </BulkActions>
        )}
        <div className="bg-muted text-muted-fg text-meta flex h-10 items-center gap-x-3.5 px-4 font-medium">
          {readOnly ? null : <BulkSelectAll items={rows} selection={selection} />}
          <span className="min-w-0 flex-[1_1_200px]">
            {t("attendance.col.student")}
          </span>
          {showHead ? (
            <>
              <span className="flex-[0_0_84px]">{caption}</span>
              <span className="flex-[0_0_214px]">{t("attendance.col.status")}</span>
              <span className="min-w-0 flex-[1_1_160px] text-right">
                {t("attendance.col.note")}
              </span>
            </>
          ) : null}
        </div>
        {rows.length > 0 ? (
          <ul aria-label={t("attendance.rosterLabel")}>
            {rows.map((row) => (
              <StudentRow
                key={row.id}
                row={row}
                edits={edits}
                readOnly={readOnly}
                caption={showRate ? caption : null}
                selected={selection.selected.has(row.id)}
                selection={selection}
                onMark={(status) => onMark([row.id], status)}
                onNote={(button) => onNote(row.student, button)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-fg text-ui border-t px-4 py-7 text-center">
            {query === ""
              ? t("attendance.nobody")
              : t("attendance.noMatch", { q: query })}
          </p>
        )}
        <p className="text-muted-fg border-t px-4 py-2.25 text-xs">
          {t("attendance.footer")}
        </p>
      </section>
    </Card>
  );
}

/**
 * StudentRow is one student of the register: the tick that selects them,
 * their avatar and name, their rate (in the danger ink under 80%) when
 * `caption` names it, their mark and their note: the note itself, which
 * opens it, or "+ Note", which waits for a mark.
 */
function StudentRow({
  row,
  edits,
  readOnly,
  caption,
  selected,
  selection,
  onMark,
  onNote,
}: Readonly<{
  row: Row;
  edits: Edits;
  readOnly: boolean;
  caption: string | null;
  selected: boolean;
  selection: Selection;
  onMark: (status: AttendanceStatus | null) => void;
  onNote: (button: HTMLElement) => void;
}>) {
  const nameId = useId();
  const { student } = row;
  const mark = markOf(student, edits);
  const rate = student.rate;
  return (
    <li
      className={cn(
        "flex min-h-14 flex-wrap items-center gap-x-3.5 gap-y-2 border-t px-4 py-2.5",
        selected && "bg-muted",
      )}
    >
      {readOnly ? null : (
        <BulkSelectRow item={row} name={student.fullName} selection={selection} />
      )}
      <span className="flex min-w-0 flex-[1_1_200px] items-center gap-2.5">
        <Avatar name={student.fullName} src={student.avatarUrl} size="30" />
        <span id={nameId} className="text-ui min-w-0 truncate font-medium">
          {student.fullName}
        </span>
      </span>
      {caption === null ? null : (
        <span
          className={cn(
            "flex-[0_0_84px] text-sm tabular-nums",
            rate !== null && rate < RATE_FLOOR ? "text-danger-ink" : "text-muted-fg",
          )}
        >
          <span className="sr-only">{caption}:</span>
          <span>{rate === null ? "—" : `${rate}%`}</span>
        </span>
      )}
      <StatusRadio
        value={mark.status}
        onChange={onMark}
        describedBy={nameId}
        disabled={readOnly}
      />
      <span className="flex min-w-0 flex-[1_1_160px] justify-end">
        <NoteCell
          name={student.fullName}
          note={mark.note}
          readOnly={readOnly}
          disabled={mark.status === null}
          onOpen={onNote}
        />
      </span>
    </li>
  );
}

/** NoteCell is a row's note: the note as a button that opens it, or "+ Note". */
function NoteCell({
  name,
  note,
  readOnly,
  disabled,
  onOpen,
}: Readonly<{
  name: string;
  note: string | null;
  readOnly: boolean;
  disabled: boolean;
  onOpen: (button: HTMLElement) => void;
}>) {
  const { t } = useTranslation();
  if (readOnly)
    return note === null ? null : (
      <span
        className="text-meta inline-flex min-w-0 items-center gap-1.5 px-2.5"
        title={note}
      >
        <MessageSquareText
          aria-hidden="true"
          className="text-muted-fg size-3.5 flex-none"
        />
        <span className="truncate">{note}</span>
      </span>
    );
  if (note !== null)
    return (
      <Button
        variant="ghost"
        size="sm"
        title={note}
        className="text-meta h-7.5 max-w-full min-w-0 justify-start px-2.5 font-normal"
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <MessageSquareText aria-hidden="true" className="text-muted-fg" />
        <span className="sr-only">{t("attendance.note.of", { name })}</span>
        <span className="truncate">{note}</span>
      </Button>
    );
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label={t("attendance.note.addFor", { name })}
      className="text-muted-fg hover:text-fg text-meta h-7.5 px-2.5 font-normal"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <Plus aria-hidden="true" />
      {t("attendance.note.add")}
    </Button>
  );
}

/**
 * RegisterSkeleton is the register while it loads: blocks where the picker
 * and its chip stand, then the card's progress line, header and rows.
 */
export function RegisterSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-45" />
        <Skeleton className="h-5.5 w-24" />
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="px-4 py-3.5">
          <Skeleton className="h-3 w-[32%]" />
        </div>
        <div className="bg-muted h-10" />
        {["w-[38%]", "w-[30%]", "w-[42%]", "w-[34%]", "w-[40%]"].map((width) => (
          <div key={width} className="flex items-center gap-3.5 border-t px-4 py-3.25">
            <Skeleton className="size-7.5 flex-none rounded-full" />
            <span className="min-w-0 flex-1">
              <Skeleton className={cn("h-3", width)} />
            </span>
            <Skeleton className="h-7.5 w-52.5" />
          </div>
        ))}
      </Card>
    </div>
  );
}
