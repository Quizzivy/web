import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CalendarOff,
  CalendarX,
  CircleStop,
  ClipboardCheck,
  Clock,
  MapPin,
  Pencil,
  PencilLine,
  Repeat,
  RotateCcw,
  StickyNote,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useCan } from "@/features/auth/permissions";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMinute } from "@/hooks/useTick";
import { ApiError } from "@/lib/api/errors";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import {
  formatDayMonth,
  formatLongDate,
  formatTimeRange,
  wallClock,
  weekdayInSentence,
} from "@/lib/i18n/schedule";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  CALENDAR_KEY,
  deleteClassSession,
  updateClassSession,
  type ClassSession,
} from "../api";
import { attendanceHref, sessionActions, type SessionAction } from "../session";
import { EditSeriesDialog, StopRepeatingDialog } from "./EditSeriesDialog";
import { EditSessionDialog } from "./EditSessionDialog";

/** OpenedSession is the session whose popover is open, and the event pressed to open it. */
export type OpenedSession = Readonly<{ session: ClassSession; anchor: HTMLElement }>;

type DialogKind = "editDate" | "cancel" | "editSeries" | "stop" | "delete";
type Opened = Readonly<{ kind: DialogKind; session: ClassSession }>;

const ICONS: Record<SessionAction, LucideIcon> = {
  attendance: ClipboardCheck,
  editDate: Pencil,
  cancel: CalendarX,
  restore: RotateCcw,
  editSeries: Repeat,
  stop: CircleStop,
  delete: Trash2,
};

/**
 * liveAnchor is the element an event for `sessionId` is drawn as now. A read
 * after a change draws the grid again, so the element pressed may be gone;
 * focus returns to the one that stands in its place (DG-36).
 */
function liveAnchor(
  sessionId: string,
  pressed: HTMLElement | null,
): HTMLElement | null {
  if (pressed?.isConnected) return pressed;
  return (
    [...document.querySelectorAll<HTMLElement>("[data-session-id]")].find(
      (element) => element.dataset.sessionId === sessionId,
    ) ?? null
  );
}

/** moveFocus moves focus through a menu's items with the arrow keys, Home and End (DG-36). */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"),
  ];
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = {
    ArrowDown: (at + 1) % items.length,
    ArrowUp: (at - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  items[next]?.focus();
}

function Fact({
  icon: Icon,
  children,
}: Readonly<{ icon: LucideIcon; children: ReactNode }>) {
  return (
    <li className="flex items-start gap-2">
      <Icon aria-hidden="true" className="text-muted-fg mt-0.5 size-3.75 flex-none" />
      <span className="min-w-0 text-pretty">{children}</span>
    </li>
  );
}

/**
 * SessionCard is what the popover and the phone's sheet both hold: the class,
 * the session's five facts, its note and marks, then the actions that apply.
 */
function SessionCard({
  session,
  sheet,
  titleId,
  actions,
  onAct,
  onClose,
}: Readonly<{
  session: ClassSession;
  sheet: boolean;
  titleId: string;
  actions: readonly SessionAction[];
  onAct: (action: SessionAction) => void;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const zone = useDisplayTimeZone();
  const start = wallClock(session.startsAt, zone).minutes;
  const repeats = session.series !== null;
  const item = cn(
    "flex w-full items-center gap-2.25 rounded-seg px-2.25 text-left font-medium hover:bg-muted focus-visible:bg-muted",
    sheet ? "text-body h-11" : "text-ui h-8.5",
  );
  return (
    <>
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "bg-brand size-2.5 flex-none rounded-sm",
            sheet ? "mt-1.5" : "mt-1.25",
          )}
        />
        <h2
          id={titleId}
          className={cn(
            "min-w-0 flex-1 leading-[1.35] font-semibold",
            sheet ? "text-title" : "text-body",
          )}
        >
          {session.className}
        </h2>
        {!sheet && (
          <button
            type="button"
            aria-label={t("calendar.session.close")}
            onClick={onClose}
            className="text-muted-fg hover:bg-muted hover:text-fg rounded-seg -mt-0.75 -mr-1 grid size-6.5 flex-none place-items-center"
          >
            <X aria-hidden="true" className="size-3.75" />
          </button>
        )}
      </div>
      <ul
        className={cn(
          "flex flex-col leading-[1.45]",
          sheet ? "gap-2 text-base" : "gap-1.5 text-sm",
        )}
      >
        <Fact icon={Calendar}>{formatLongDate(session.date, locale)}</Fact>
        <Fact icon={Clock}>{formatTimeRange(start, session.durationMinutes)}</Fact>
        {session.room !== null && <Fact icon={MapPin}>{session.room}</Fact>}
        <Fact icon={repeats ? Repeat : CalendarOff}>
          {repeats
            ? t("calendar.session.every", {
                weekday: weekdayInSentence(session.series!.weekday, locale),
              })
            : t("calendar.session.oneOff")}
        </Fact>
        {session.note !== null && <Fact icon={StickyNote}>{session.note}</Fact>}
        {session.cancelled ? (
          <li>
            <Badge variant="danger">
              <CalendarX aria-hidden="true" />
              {t("calendar.session.cancelled")}
            </Badge>
          </li>
        ) : (
          session.changed && (
            <li>
              <Badge variant="secondary">
                <PencilLine aria-hidden="true" />
                {t("calendar.session.changed")}
              </Badge>
            </li>
          )
        )}
      </ul>
      {actions.length > 0 && (
        <>
          <div
            aria-hidden="true"
            className={cn("bg-border h-px", sheet ? "-mx-3.5" : "-mx-3")}
          />
          <div
            role="menu"
            tabIndex={-1}
            aria-label={t("calendar.session.actions")}
            onKeyDown={moveFocus}
            className="flex flex-col gap-px"
          >
            {actions.map((action, index) => {
              const Icon = ICONS[action];
              const body = (
                <>
                  <Icon aria-hidden="true" className="size-3.75 flex-none" />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`calendar.session.act.${action}`)}
                  </span>
                </>
              );
              const props = {
                role: "menuitem",
                tabIndex: index === 0 ? 0 : -1,
                "data-action": action,
                className: cn(item, action === "delete" && "text-danger-ink"),
              } as const;
              return action === "attendance" ? (
                <Link key={action} to={attendanceHref(session)} {...props}>
                  {body}
                </Link>
              ) : (
                <button
                  key={action}
                  type="button"
                  onClick={() => onAct(action)}
                  {...props}
                >
                  {body}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function failure(cause: unknown, t: ReturnType<typeof useTranslation>["t"]) {
  if (cause instanceof ApiError && cause.code === "SESSION_HAS_ATTENDANCE")
    return t("calendar.session.delete.hasAttendance");
  return t("calendar.session.failed");
}

/**
 * SessionPopover is a class session's popover (T-R8.11, the Session Popover
 * proposal; DG-92): beside the session from 768px, a sheet from the bottom
 * below. It states the class, the date, the time range, the room, "Mỗi {thứ}"
 * or "Không lặp lại", the note, and whether the date was cancelled or changed,
 * then the actions that apply (`sessionActions`).
 *
 * The keyboard (DG-36): focus starts on the first action, the arrow keys,
 * Home and End move through them, and Esc closes the popover and returns focus
 * to the session. An action that opens a dialog closes the popover, and the
 * dialog returns focus to the session when it closes.
 *
 * It holds the dialogs its actions open: Edit this date, the Cancel confirm,
 * Edit repeating session, Stop repeating and the Delete confirm. Restore
 * asks nothing. Every change reads the calendar again.
 */
export function SessionPopover({
  opened,
  today,
  onClose,
}: Readonly<{
  opened: OpenedSession | null;
  today: string;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const wide = useMediaQuery("(min-width: 768px)");
  const minute = useMinute(opened !== null);
  const write = useCan("teaching.classes.write");
  const attend = useCan("teaching.attendance");
  const titleId = useId();
  const [dialog, setDialog] = useState<Opened | null>(null);
  const [pressed, setPressed] = useState<OpenedSession | null>(opened);
  if (opened !== null && opened !== pressed) setPressed(opened);
  const leaving = useRef(false);
  const returnFocus = {
    get current() {
      return pressed ? liveAnchor(pressed.session.id, pressed.anchor) : null;
    },
  };

  const refresh = () => client.invalidateQueries({ queryKey: CALENDAR_KEY });
  const cancel = useMutation({
    mutationFn: ({
      session,
      cancelled,
    }: {
      session: ClassSession;
      cancelled: boolean;
    }) => updateClassSession(session.id, { cancelled }),
    onSuccess: async (_, { session, cancelled }) => {
      setDialog(null);
      notify.success(
        t(
          cancelled
            ? "calendar.session.toast.cancelled"
            : "calendar.session.toast.restored",
          {
            date: formatDayMonth(session.date, locale),
          },
        ),
      );
      await refresh();
    },
    onError: (_, { cancelled }) => {
      if (!cancelled) notify.error(t("calendar.session.failed"));
    },
  });
  const remove = useMutation({
    mutationFn: (session: ClassSession) => deleteClassSession(session.id),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
    },
    onError: (cause, session) => {
      if (cause instanceof ApiError && cause.code === "SESSION_IN_SERIES") {
        remove.reset();
        setDialog({ kind: "cancel", session });
      }
    },
  });

  function act(action: SessionAction) {
    if (opened === null) return;
    const { session } = opened;
    if (action === "restore") {
      if (!cancel.isPending) cancel.mutate({ session, cancelled: false });
      leaving.current = false;
      onClose();
      return;
    }
    if (action === "attendance") return;
    leaving.current = true;
    cancel.reset();
    remove.reset();
    setDialog({ kind: action, session });
    onClose();
  }

  const session = opened?.session ?? null;
  const actions = session
    ? sessionActions(session, minute * 60_000, { write, attend })
    : [];
  const close = (dialogKind: DialogKind) => (next: boolean) => {
    if (!next && dialog?.kind === dialogKind) setDialog(null);
  };
  const of = (kind: DialogKind) => (dialog?.kind === kind ? dialog.session : null);

  const focusFirst = (event: Event) => {
    event.preventDefault();
    const content = event.currentTarget as HTMLElement;
    (content.querySelector<HTMLElement>("[role='menuitem']") ?? content).focus();
  };
  const focusBack = (event: Event) => {
    event.preventDefault();
    if (leaving.current) {
      leaving.current = false;
      return;
    }
    returnFocus.current?.focus();
  };

  const card =
    session === null ? null : (
      <SessionCard
        session={session}
        sheet={!wide}
        titleId={titleId}
        actions={actions}
        onAct={act}
        onClose={onClose}
      />
    );

  return (
    <>
      {wide ? (
        <Popover
          open={opened !== null}
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
        >
          <PopoverAnchor virtualRef={{ current: opened?.anchor ?? null }} />
          <PopoverContent
            role="dialog"
            aria-labelledby={titleId}
            side="right"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={focusFirst}
            onCloseAutoFocus={focusBack}
            className="flex w-73 flex-col gap-2.5 rounded-xl p-3"
          >
            {card}
          </PopoverContent>
        </Popover>
      ) : (
        <Dialog
          open={opened !== null}
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
        >
          <DialogContent
            showCloseButton={false}
            aria-labelledby={titleId}
            onOpenAutoFocus={focusFirst}
            onCloseAutoFocus={focusBack}
            className="bg-card shadow-float top-auto right-0 bottom-0 left-0 flex max-h-[85%] max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-y-auto rounded-t-3xl rounded-b-none border px-3.5 pt-2 pb-3.5 sm:max-w-none"
          >
            <span
              aria-hidden="true"
              className="bg-border mx-auto mt-0.5 h-1 w-9 flex-none rounded-full"
            />
            <DialogTitle className="sr-only">{session?.className}</DialogTitle>
            <DialogDescription className="sr-only">
              {session ? formatLongDate(session.date, locale) : ""}
            </DialogDescription>
            {card}
          </DialogContent>
        </Dialog>
      )}
      <EditSessionDialog
        session={of("editDate")}
        onOpenChange={close("editDate")}
        returnFocus={returnFocus}
      />
      <EditSeriesDialog
        session={of("editSeries")}
        today={today}
        onOpenChange={close("editSeries")}
        returnFocus={returnFocus}
      />
      <StopRepeatingDialog
        session={of("stop")}
        today={today}
        onOpenChange={close("stop")}
        returnFocus={returnFocus}
      />
      <ConfirmDialog
        open={of("cancel") !== null}
        onOpenChange={(next) => {
          if (!next) cancel.reset();
          close("cancel")(next);
        }}
        title={t("calendar.session.cancelConfirm.title", {
          date: formatDayMonth(of("cancel")?.date ?? today, locale),
        })}
        description={t("calendar.session.cancelConfirm.body")}
        cancelLabel={t("calendar.session.cancelConfirm.keep")}
        confirmLabel={t("calendar.session.cancelConfirm.confirm")}
        pending={cancel.isPending}
        error={cancel.isError ? t("calendar.session.failed") : null}
        returnFocus={returnFocus}
        onConfirm={() => {
          const target = of("cancel");
          if (target !== null && !cancel.isPending)
            cancel.mutate({ session: target, cancelled: true });
        }}
      />
      <ConfirmDialog
        open={of("delete") !== null}
        onOpenChange={(next) => {
          if (!next) remove.reset();
          close("delete")(next);
        }}
        title={t("calendar.session.delete.title", {
          date: formatDayMonth(of("delete")?.date ?? today, locale),
        })}
        description={t("calendar.session.delete.body")}
        confirmLabel={t("calendar.session.delete.confirm")}
        destructive
        alert
        pending={remove.isPending}
        error={remove.isError ? failure(remove.error, t) : null}
        returnFocus={returnFocus}
        onConfirm={() => {
          const target = of("delete");
          if (target !== null && !remove.isPending) remove.mutate(target);
        }}
      />
    </>
  );
}
