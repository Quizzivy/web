import { useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Megaphone, MessageSquare } from "lucide-react";
import { getMySummary, notificationKeys } from "@/features/notifications/api";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ApiError } from "@/lib/api/errors";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import type { MessageAttachment } from "../../api";
import { AnnouncementCard } from "../../components/AnnouncementCard";
import { Composer } from "../../components/Composer";
import { DayPill } from "../../components/DayPill";
import { MessageBubble } from "../../components/MessageBubble";
import { ThreadList, type ListRow } from "../../components/ThreadList";
import { ThreadNotice } from "../../components/ThreadNotice";
import { ThreadView } from "../../components/ThreadView";
import { useDraft } from "../../drafts";
import { buildStream, type StreamEntry } from "../../stream";
import {
  getStudentAttachmentUrl,
  getStudentClassThread,
  getStudentDirectThread,
  listStudentThreads,
  markStudentThreadRead,
  postStudentDirectMessage,
  studentRefOf,
  studentThreadKey,
  studentThreadPath,
  studentThreadsKey,
  type StudentClassThread,
  type StudentDirectThread,
  type StudentMessage,
  type StudentRef,
  type StudentThread,
} from "../../studentApi";
import { clock, rowTime } from "../../time";
import { useThread, type ThreadSource } from "../../useThread";

/**
 * TWO_PANES is the window width from which the list and the thread sit side
 * by side, the student deck's `single = w < 760`. The student shell has no
 * sidebar, so the window's width is the page's.
 */
const TWO_PANES = "(min-width: 760px)";
/** The skeleton's rows: a teacher, then two class channels (the proposal's three). */
const SKELETON: readonly ListRow["kind"][] = ["direct", "class", "class"];

type Head =
  | Readonly<{ kind: "direct"; teacher: StudentDirectThread["teacher"] }>
  | Readonly<{
      kind: "class";
      room: StudentClassThread["class"];
      teacher: StudentClassThread["teacher"];
    }>;

function refFrom(
  params: Readonly<Record<string, string | undefined>>,
): StudentRef | null {
  if (params["classId"]) return { kind: "class", id: params["classId"] };
  if (params["teacherId"]) return { kind: "direct", id: params["teacherId"] };
  return null;
}

function sameRef(a: StudentRef | null, b: StudentRef | null): boolean {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id;
}

/** teacherLine is a teacher's sub-line: the classes they teach the student, or "Former teacher". */
function teacherLine(
  teacher: Readonly<{ classNames: readonly string[]; former: boolean }>,
  t: TFunction,
): string {
  if (teacher.former) return t("messages.student.former");
  return t("messages.student.teacherSub", { classes: teacher.classNames.join(", ") });
}

function stateOf(
  read: Readonly<{ isPending: boolean; isError: boolean; data?: unknown }>,
) {
  if (read.isPending) return "loading" as const;
  if (read.isError && read.data === undefined) return "error" as const;
  return "ready" as const;
}

function sourceFor(ref: StudentRef): ThreadSource<StudentMessage, Head> {
  return {
    key: studentThreadKey(ref),
    read: async (cursor, signal) => {
      if (ref.kind === "class") {
        const read = await getStudentClassThread(ref.id, cursor, signal);
        return {
          head: { kind: "class", room: read.class, teacher: read.teacher },
          page: read,
        };
      }
      const read = await getStudentDirectThread(ref.id, cursor, signal);
      return { head: { kind: "direct", teacher: read.teacher }, page: read };
    },
    // A channel has no composer, so only a direct thread is ever posted to;
    // and a student's message is text alone.
    post: (message) =>
      postStudentDirectMessage(ref.id, {
        clientId: message.clientId,
        body: message.body ?? "",
      }),
    markRead: (messageId) => markStudentThreadRead(ref, messageId),
  };
}

/**
 * StudentMessagesPage is the student's Messages (T-R7.21): their teachers'
 * direct threads and their classes' announcement channels beside the open
 * thread, at most 960px wide and as tall as the page, one pane at a time
 * under 760px. A teacher's row reads "Your teacher · {classes}", a channel's
 * "Class announcements". A direct thread takes text only, with Enter to
 * send; a channel is read-only, its footer a link to the teacher's thread.
 * The address names the open thread, so the Classes card's message button
 * is plain navigation.
 */
export default function StudentMessagesPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  useDisplayTimeZone();
  const client = useQueryClient();
  const navigate = useNavigate();
  const open = refFrom(useParams());
  const single = !useMediaQuery(TWO_PANES);
  // Below 768 the shell's header carries the title (a detail route, DG-81).
  const wide = useMediaQuery("(min-width: 768px)");

  const list = useQuery({
    queryKey: studentThreadsKey,
    queryFn: ({ signal }) => listStudentThreads(signal),
    retry: false,
  });

  // The list follows the unread count the shell's summary polls.
  const summary = useQuery({
    queryKey: notificationKeys.summary("student"),
    queryFn: ({ signal }) => getMySummary("student", signal),
    staleTime: 60_000,
  });
  const unreadMessages = summary.data?.unreadMessages;
  const heard = useRef(unreadMessages);
  useEffect(() => {
    if (unreadMessages === undefined || heard.current === unreadMessages) return;
    const first = heard.current === undefined;
    heard.current = unreadMessages;
    if (!first) void client.invalidateQueries({ queryKey: studentThreadsKey });
  }, [client, unreadMessages]);

  // From 760px the deck opens the first conversation when none is named.
  const firstRow = list.data?.threads[0];
  useEffect(() => {
    if (single || open !== null || firstRow === undefined) return;
    const ref = studentRefOf(firstRow);
    if (ref !== null) void navigate(studentThreadPath(ref), { replace: true });
  }, [single, open, firstRow, navigate]);

  const now = new Date();
  const rows = (list.data?.threads ?? []).flatMap((row): ListRow[] => {
    const ref = studentRefOf(row);
    if (ref === null) return [];
    return [
      {
        key: `${ref.kind}:${ref.id}`,
        to: studentThreadPath(ref),
        kind: ref.kind,
        title: row.title,
        sub:
          ref.kind === "class" ? t("messages.student.channelSub") : teacherLine(row, t),
        avatarUrl: row.avatarUrl,
        time:
          row.lastMessageAt === null
            ? null
            : rowTime(row.lastMessageAt, now, locale, t),
        unread: row.unread,
        active: !single && sameRef(ref, open),
      },
    ];
  });
  const openRow = list.data?.threads.find((row) => sameRef(studentRefOf(row), open));

  const showList = !single || open === null;
  const showThread = !single || open !== null;

  return (
    <div className="mx-auto flex h-full min-h-120 w-full max-w-240 flex-col gap-3 min-[768px]:gap-4">
      {wide && (
        <h1 className="text-h1-student font-semibold tracking-[-0.02em]">
          {t("messages.title")}
        </h1>
      )}
      <div className="bg-card shadow-card flex min-h-0 flex-1 overflow-hidden rounded-2xl border">
        {showList && (
          <ThreadList
            label={t("messages.list.label")}
            single={single}
            width="w-75"
            skeleton={SKELETON}
            rows={rows}
            state={stateOf(list)}
            onRetry={() => void list.refetch()}
            emptyText={t("messages.student.empty")}
          />
        )}
        {showThread && open !== null && (
          <StudentThreadPane
            key={`${open.kind}:${open.id}`}
            open={open}
            row={openRow}
            single={single}
            onBack={() => void navigate("/messages")}
          />
        )}
        {showThread && open === null && (
          <div className="bg-sidebar min-w-0 flex-1" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/** PaneView is what the pane says of the thread, from its read or, while that loads, from its row. */
type PaneView = Readonly<{
  title: string;
  sub: string;
  canPost: boolean;
  /** The class's teacher, whose thread a channel's footer opens. */
  teacher: Readonly<{ id: string; name: string }> | null;
}>;

function paneView(
  ref: StudentRef,
  head: Head | undefined,
  row: StudentThread | undefined,
  t: TFunction,
): PaneView {
  if (ref.kind === "class") {
    const read = head?.kind === "class" ? head : null;
    return {
      title: read?.room.name ?? row?.title ?? "",
      sub: t("messages.student.channelSub"),
      canPost: false,
      teacher: read?.teacher ?? null,
    };
  }
  const teacher = head?.kind === "direct" ? head.teacher : null;
  const lines = teacher ?? row;
  return {
    title: teacher?.name ?? row?.title ?? "",
    sub: lines === undefined ? "" : teacherLine(lines, t),
    canPost: teacher?.canPost !== false,
    teacher: null,
  };
}

/**
 * StudentThreadPane is the open thread of the student side: a teacher's
 * direct thread, with its composer, or a class's read-only channel.
 */
function StudentThreadPane({
  open,
  row,
  single,
  onBack,
}: Readonly<{
  open: StudentRef;
  row: StudentThread | undefined;
  single: boolean;
  onBack: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const source = useMemo(() => sourceFor(open), [open]);
  const [refused, setRefused] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const threadKey = `student:${open.kind}:${open.id}`;
  const [draft, setDraft] = useDraft(threadKey);

  const thread = useThread(source, {
    onSent: () => void client.invalidateQueries({ queryKey: studentThreadsKey }),
    onRefused: (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        setRefused(cause.code);
        void thread.refetch();
      }
    },
    onRead: () => {
      client.setQueryData<{ threads: StudentThread[] }>(
        studentThreadsKey,
        (held) =>
          held && {
            threads: held.threads.map((x) =>
              sameRef(studentRefOf(x), open) ? { ...x, unread: 0 } : x,
            ),
          },
      );
      void client.invalidateQueries({ queryKey: notificationKeys.summary("student") });
    },
  });
  const data = thread.data;
  const isClass = open.kind === "class";
  const view = paneView(open, data?.head, row, t);

  const download = (attachment: MessageAttachment) => {
    setDownloading(attachment.id);
    getStudentAttachmentUrl(attachment.id).then(
      (link) => {
        setDownloading(null);
        window.location.assign(link.url);
      },
      () => {
        setDownloading(null);
        notify.error(t("messages.chip.downloadFailed"));
      },
    );
  };

  const entries = data
    ? buildStream(data.messages, [], thread.pending, {
        now: new Date(),
        locale,
        t,
        complete: data.nextBefore === null,
      })
    : [];

  let footer;
  if (isClass) footer = <ReadOnlyFooter teacher={view.teacher} />;
  else if (!view.canPost || refused === "MESSAGING_NOT_ALLOWED")
    footer = (
      <ThreadNotice icon={Ban} text={t("messages.accountOff", { name: view.title })} />
    );
  else
    footer = (
      <Composer
        draft={draft}
        onDraft={setDraft}
        onSend={thread.send}
        enterSends
        placeholder={t("messages.placeholderDirect", { name: view.title })}
      />
    );

  return (
    <ThreadView
      threadKey={threadKey}
      avatar={null}
      title={view.title}
      sub={view.sub}
      onBack={single ? onBack : undefined}
      state={stateOf(thread)}
      onRetry={() => void thread.refetch()}
      count={entries.length}
      oldestKey={entries.find((entry) => entry.kind !== "day")?.key ?? null}
      emptyIcon={isClass ? Megaphone : MessageSquare}
      emptyText={
        isClass ? t("messages.thread.channelEmpty") : t("messages.thread.empty")
      }
      canLoadEarlier={data?.nextBefore != null}
      earlier={thread.earlier}
      onLoadEarlier={thread.loadEarlier}
      latestId={data?.latestId ?? null}
      onSeen={thread.seen}
      footer={footer}
    >
      {entries.map((entry) => (
        <StudentEntry
          key={entry.key}
          entry={entry}
          isClass={isClass}
          download={download}
          downloading={downloading}
          retry={thread.retry}
        />
      ))}
    </ThreadView>
  );
}

/**
 * ReadOnlyFooter closes a channel: "Only your teacher can post here.", then
 * a link to the teacher's own thread, where the student can reply.
 */
function ReadOnlyFooter({
  teacher,
}: Readonly<{ teacher: Readonly<{ id: string; name: string }> | null }>) {
  const { t } = useTranslation();
  return (
    <p className="text-muted-fg flex-none border-t px-4 py-3 text-center text-sm text-pretty">
      {t("messages.student.readOnly")}
      {teacher !== null && (
        <>
          {" "}
          <Link
            to={studentThreadPath({ kind: "direct", id: teacher.id })}
            className="text-fg font-semibold underline underline-offset-2 max-[767px]:inline-flex max-[767px]:min-h-10 max-[767px]:items-center"
          >
            {t("messages.student.reply", { name: teacher.name })}
          </Link>
        </>
      )}
    </p>
  );
}

/** StudentEntry draws one line of the student's stream: a day, an announcement, a message or one on its way. */
function StudentEntry({
  entry,
  isClass,
  download,
  downloading,
  retry,
}: Readonly<{
  entry: StreamEntry<StudentMessage>;
  isClass: boolean;
  download: (attachment: MessageAttachment) => void;
  downloading: string | null;
  retry: (clientId: string) => void;
}>) {
  const locale = useLocale();
  if (entry.kind === "day") return <DayPill label={entry.label} />;
  if (entry.kind === "event") return null;
  if (entry.kind === "pending") {
    const p = entry.pending;
    return (
      <MessageBubble
        mine
        body={p.body}
        attachment={null}
        time=""
        status={p.status}
        onRetry={() => retry(p.clientId)}
      />
    );
  }
  const m = entry.message;
  const held = m.attachment !== null && downloading === m.attachment.id;
  if (isClass)
    return (
      <AnnouncementCard
        body={m.body}
        attachment={m.attachment}
        time={clock(m.createdAt, locale)}
        onDownload={download}
        downloading={held}
      />
    );
  return (
    <MessageBubble
      mine={m.mine}
      body={m.body}
      attachment={m.attachment}
      time={clock(m.createdAt, locale)}
      onDownload={download}
      downloading={held}
    />
  );
}
