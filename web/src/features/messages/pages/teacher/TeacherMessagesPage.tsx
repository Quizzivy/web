import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Ban,
  GraduationCap,
  Lock,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { IconTile } from "@/components/shared/IconTile";
import { SearchInput } from "@/components/shared/SearchInput";
import { useCan, useWorkspace } from "@/features/auth/permissions";
import { getTeacherSummary } from "@/features/dashboard/api";
import { dashboardKeys } from "@/features/dashboard/keys";
import { notificationKeys } from "@/features/notifications/api";
import { PageHead } from "@/layouts/shell/PageHead";
import { useContentWidthAtLeast } from "@/layouts/shell/contentWidth";
import { ApiError } from "@/lib/api/errors";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import { roleName } from "@/lib/roleName";
import { useDebounced } from "@/lib/useDebounced";
import {
  LIST_KEYS,
  MESSAGES_PATH,
  STAFF_MESSAGES_KEY,
  colleagueThreadsKey,
  getColleagueThread,
  listColleagueThreads,
  getStaffAttachmentUrl,
  getStaffClassThread,
  getStaffDirectThread,
  listStaffThreads,
  markStaffThreadRead,
  postStaffMessage,
  refOf,
  sameRef,
  staffThreadKey,
  staffThreadsKey,
  threadPath,
  uploadMessageAttachment,
  type ColleagueDirectThread,
  type ColleagueThread,
  type MessageAttachment,
  type MessagesOpening,
  type StaffClassThread,
  type StaffDirectThread,
  type StaffMessage,
  type StaffThread,
  type ThreadRef,
} from "../../api";
import { AnnouncementCard } from "../../components/AnnouncementCard";
import { AttemptEventCard } from "../../components/AttemptEventCard";
import { Composer } from "../../components/Composer";
import { DayPill } from "../../components/DayPill";
import { MessageBubble } from "../../components/MessageBubble";
import { staffAttach } from "../../components/StaffAttach";
import { ThreadDetails } from "../../components/ThreadDetails";
import { RecipientPicker, type Picked } from "../../components/RecipientPicker";
import {
  ThreadList,
  type CandidateGroup,
  type ListRow,
} from "../../components/ThreadList";
import { ThreadNotice } from "../../components/ThreadNotice";
import { ThreadView } from "../../components/ThreadView";
import { KIND_ICON, KIND_OF } from "../../attachments";
import type { Outgoing } from "../../compose";
import { listedOf, mergeByLatest, type Listed } from "../../merge";
import { useDraft, type Draft } from "../../drafts";
import { buildStream, type StreamEntry } from "../../stream";
import { clock, rowTime } from "../../time";
import { useThread, type ThreadSource } from "../../useThread";

/** SINGLE_BELOW is the content width under which one pane shows at a time (the deck's msgSingle). */
export const SINGLE_BELOW = 760;
const SEARCH_DELAY_MS = 300;
const STAFF_ATTACH = staffAttach(uploadMessageAttachment);

type Tab = "all" | "direct" | "classes" | "colleagues";

/** Whom New message offers: students, and colleagues (F2). */
const PICKER_AUDIENCES = ["students", "colleagues"] as const;
type Head =
  | Readonly<{ kind: "direct"; student: StaffDirectThread["student"] }>
  | Readonly<{ kind: "class"; room: StaffClassThread["class"] }>
  | Readonly<{ kind: "colleague"; colleague: ColleagueDirectThread["colleague"] }>;

/**
 * LocationState is what a link hands the page: New announcement asks the
 * thread it opens to focus the composer, and a link from elsewhere may name
 * the tab to start on.
 */
type LocationState = (MessagesOpening & Readonly<{ compose?: boolean }>) | null;

const TABS: readonly Tab[] = ["all", "direct", "classes", "colleagues"];

/** askedTab is the tab a link asks for, or null when it names none Messages has. */
function askedTab(state: unknown): Tab | null {
  const asked = (state as LocationState)?.tab;
  return asked !== undefined && TABS.includes(asked) ? asked : null;
}

/** tabFrom is the tab a link asks for, else All. */
function tabFrom(state: unknown): Tab {
  return askedTab(state) ?? "all";
}

/** TAB_KIND is the kind of thread each tab but All lists. */
const TAB_KIND = {
  direct: "direct",
  classes: "class",
  colleagues: "colleague",
} as const;

/** inTab tells whether a row belongs to the list's tab. */
function inTab(row: Listed, tab: Tab): boolean {
  return tab === "all" || row.ref.kind === TAB_KIND[tab];
}

function refFrom(
  params: Readonly<Record<string, string | undefined>>,
): ThreadRef | null {
  if (params["classId"]) return { kind: "class", id: params["classId"] };
  if (params["studentId"]) return { kind: "direct", id: params["studentId"] };
  if (params["colleagueId"]) return { kind: "colleague", id: params["colleagueId"] };
  return null;
}

/** givenName is what a teacher calls a student, the last word of a Vietnamese name. */
function givenName(name: string): string {
  return name.trim().split(/\s+/).at(-1) ?? name;
}

/** previewLine words a row's last message: "You: " before the reader's own, and a file by its name. */
function previewLine(preview: StaffThread["preview"], t: TFunction): string | null {
  if (preview === null) return null;
  const you = preview.mine ? t("messages.list.you") : "";
  const said =
    preview.text ??
    t("messages.list.attachment", { name: preview.attachmentName ?? "" });
  return you + said;
}

/**
 * studentLine is what names a student under their name: "Former student",
 * else the caller's classes they are in, else their other classes (a student
 * the caller does not teach, F2), else "In no class".
 */
function studentLine(
  former: boolean,
  classNames: readonly string[],
  otherClassNames: readonly string[],
  t: TFunction,
): string {
  if (former) return t("messages.former");
  if (classNames.length > 0) return classNames.join(", ");
  if (otherClassNames.length > 0) return otherClassNames.join(", ");
  return t("messages.noClass");
}

/** colleagueRole is a colleague's role as it reads on screen: a built-in one localised (Q9). */
function colleagueRole(
  who: Pick<ColleagueThread, "roleName" | "roleBuiltinKey">,
  t: TFunction,
): string {
  return roleName({ builtinKey: who.roleBuiltinKey, name: who.roleName }, t);
}

/** rowSub is a row's sub-line when it shows no message: its size, the student's line, or the colleague's role. */
function rowSub(listed: Listed, t: TFunction): string {
  if (listed.source === "colleague") return colleagueRole(listed.row, t);
  const row = listed.row;
  if (row.thread.kind === "class")
    return t("messages.list.classSub", { count: row.studentCount ?? 0 });
  return studentLine(row.former, row.classNames, row.otherClassNames, t);
}

/** stateOf is what a pane shows for a read: loading until its first answer, then the error or the content. */
function stateOf(
  read: Readonly<{ isPending: boolean; isError: boolean; data?: unknown }>,
) {
  if (read.isPending) return "loading" as const;
  if (read.isError && read.data === undefined) return "error" as const;
  return "ready" as const;
}

/** listRow words one row of the list; `active` is the open thread when the list stands beside it. */
function listRow(
  listed: Listed,
  at: Readonly<{
    t: TFunction;
    locale: ReturnType<typeof useLocale>;
    now: Date;
    active: ThreadRef | null;
  }>,
): ListRow {
  const { ref, row } = listed;
  const { t } = at;
  // A former student's row says so in place of its last message (Q5).
  const former = listed.source === "staff" && listed.row.former;
  const said = row.candidate || former ? null : previewLine(row.preview, t);
  return {
    key: `${ref.kind}:${ref.id}`,
    to: threadPath(ref),
    kind: ref.kind === "class" ? "class" : "direct",
    title: row.title,
    sub: said ?? rowSub(listed, t),
    avatarUrl: row.avatarUrl,
    time:
      row.lastMessageAt === null
        ? null
        : rowTime(row.lastMessageAt, at.now, at.locale, t),
    unread: row.unread,
    active: sameRef(ref, at.active),
  };
}

/**
 * candidateGroups is, while a search is typed, the people with no thread yet,
 * each under its label: students in All and Direct, colleagues in All and
 * Colleagues (the F2 page's search).
 */
function candidateGroups(
  staff: readonly StaffThread[],
  colleagues: readonly ColleagueThread[],
  tab: Tab,
  toRow: (listed: Listed) => ListRow,
  t: TFunction,
): CandidateGroup[] {
  const group = (key: string, label: string, found: readonly Listed[]) => ({
    key,
    label,
    rows: found.filter((row) => row.row.candidate && inTab(row, tab)).map(toRow),
  });
  return [
    group("students", t("messages.list.candidates"), listedOf(staff, [])),
    group(
      "colleagues",
      t("messages.list.colleagueCandidates"),
      listedOf([], colleagues),
    ),
  ];
}

type Read = Readonly<{ isPending: boolean; isError: boolean; data?: unknown }>;

/**
 * firstInTab is the conversation the tab opens on from 760px: the newest of
 * both lists, once both reads have answered (the colleague read may fail).
 */
function firstInTab(
  base: Readonly<{ data?: { threads: StaffThread[] } | undefined; isSuccess: boolean }>,
  peers: Readonly<{
    data?: { threads: ColleagueThread[] } | undefined;
    isPending: boolean;
  }>,
  tab: Tab,
): Listed | undefined {
  if (base.data === undefined || !base.isSuccess || peers.isPending) return undefined;
  return mergeByLatest(
    base.data.threads.filter((row) => !row.candidate),
    (peers.data?.threads ?? []).filter((row) => !row.candidate),
  ).find((row) => inTab(row, tab));
}

/**
 * paneState is what the list pane shows: Colleagues is the colleague read's;
 * All waits for both reads and fails with the threads' read, showing the rest
 * when only the colleague read failed; Direct and Classes are the threads'.
 */
function paneState(tab: Tab, list: Read, peers: Read) {
  if (tab === "colleagues") return stateOf(peers);
  const state = stateOf(list);
  return tab === "all" && state === "ready" && peers.isPending ? "loading" : state;
}

function sourceFor(ref: ThreadRef): ThreadSource<StaffMessage, Head> {
  return {
    key: staffThreadKey(ref),
    read: async (cursor, signal) => {
      // A colleague thread has no attempt cards and no "Seen by" (F2).
      if (ref.kind === "colleague") {
        const read = await getColleagueThread(ref.id, cursor, signal);
        return { head: { kind: "colleague", colleague: read.colleague }, page: read };
      }
      if (ref.kind === "class") {
        const read = await getStaffClassThread(ref.id, cursor, signal);
        return { head: { kind: "class", room: read.class }, page: read };
      }
      const read = await getStaffDirectThread(ref.id, cursor, signal);
      return {
        head: { kind: "direct", student: read.student },
        page: read,
        events: read.contextEvents,
      };
    },
    post: (message) => postStaffMessage(ref, message),
    markRead: (messageId) => markStaffThreadRead(ref, messageId),
  };
}

/**
 * TeacherMessagesPage is the staff Messages (T-R7.20): the list of class
 * channels and direct threads beside the open thread, one pane at a time under
 * 760px of content. The address names the open thread, so a thread opened
 * from elsewhere (T-R7.22) and the back arrow are plain navigation.
 */
export default function TeacherMessagesPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  useDisplayTimeZone();
  const client = useQueryClient();
  const navigate = useNavigate();
  const params = useParams();
  const open = refFrom(params);
  const single = !useContentWidthAtLeast(SINGLE_BELOW);
  const canAnnounce = useCan("teaching.classes.write");
  const location = useLocation();
  const [tab, setTab] = useState<Tab>(() => tabFrom(location.state));
  const reasonId = useId();
  const [typed, setTyped] = useState("");
  const [picking, setPicking] = useState(false);
  const q = useDebounced(typed.trim(), SEARCH_DELAY_MS);

  const base = useQuery({
    queryKey: staffThreadsKey(""),
    queryFn: ({ signal }) => listStaffThreads("", signal),
    retry: false,
  });
  const searched = useQuery({
    queryKey: staffThreadsKey(q),
    queryFn: ({ signal }) => listStaffThreads(q, signal),
    enabled: q !== "",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const list = q === "" ? base : searched;
  // The colleague threads (F2), merged into All and listed under Colleagues.
  const peersBase = useQuery({
    queryKey: colleagueThreadsKey(""),
    queryFn: ({ signal }) => listColleagueThreads("", signal),
    retry: false,
  });
  const peersSearched = useQuery({
    queryKey: colleagueThreadsKey(q),
    queryFn: ({ signal }) => listColleagueThreads(q, signal),
    enabled: q !== "",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const peers = q === "" ? peersBase : peersSearched;

  // The list follows the unread count the shell's summary polls.
  const workspace = useWorkspace("teacher");
  const summary = useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: ({ signal }) => getTeacherSummary(signal),
    enabled: workspace,
    staleTime: 60_000,
  });
  const unreadMessages = summary.data?.unreadMessages;
  const heard = useRef(unreadMessages);
  useEffect(() => {
    if (unreadMessages === undefined || heard.current === unreadMessages) return;
    const first = heard.current === undefined;
    heard.current = unreadMessages;
    if (!first)
      for (const queryKey of LIST_KEYS) void client.invalidateQueries({ queryKey });
  }, [client, unreadMessages]);

  const now = new Date();
  const firstClass = base.data?.threads.find((row) => row.thread.kind === "class");
  const classRef = firstClass === undefined ? null : refOf(firstClass);

  // From 760px the deck opens the first conversation of the tab when none is
  // named. A link that asks for a tab asks for that list, not a thread: the
  // Students page's bulk Message for several students opens Direct, and its
  // first row (often the latest thread) may be a student no one selected.
  const listAsked = askedTab(location.state) !== null;
  const firstRow = firstInTab(base, peersBase, tab);
  useEffect(() => {
    if (single || listAsked || open !== null || firstRow === undefined) return;
    void navigate(threadPath(firstRow.ref), { replace: true });
  }, [single, listAsked, open, firstRow, navigate]);

  const toRow = (listed: Listed) =>
    listRow(listed, { t, locale, now, active: single ? null : open });
  const staffRows = list.data?.threads ?? [];
  const peerRows = peers.data?.threads ?? [];
  const rows = mergeByLatest(
    staffRows.filter((row) => !row.candidate),
    peerRows.filter((row) => !row.candidate),
  )
    .filter((row) => inTab(row, tab))
    .map(toRow);
  const candidates =
    q === "" ? [] : candidateGroups(staffRows, peerRows, tab, toRow, t);
  const directUnread = (base.data?.threads ?? [])
    .filter((row) => row.thread.kind === "direct")
    .reduce((sum, row) => sum + row.unread, 0);
  const colleagueUnread = (peersBase.data?.threads ?? []).reduce(
    (sum, row) => sum + row.unread,
    0,
  );
  const openRow = [
    ...listedOf(list.data?.threads ?? [], peers.data?.threads ?? []),
    ...listedOf(base.data?.threads ?? [], peersBase.data?.threads ?? []),
  ].find((row) => sameRef(row.ref, open));

  const listState = paneState(tab, list, peers);
  const retryList = () => {
    if (tab !== "colleagues" && list.isError) void list.refetch();
    if (tab !== "direct" && tab !== "classes" && peers.isError) void peers.refetch();
  };

  const noClass = base.isSuccess && classRef === null;
  const announceOff = noClass || !canAnnounce;
  // Why New announcement is off: no right to post, or no class to post to.
  let offReason: string | undefined;
  if (!canAnnounce) offReason = t("messages.announceNotAllowed");
  else if (noClass) offReason = t("messages.newAnnouncementOff");
  const newAnnouncement = () => {
    if (announceOff || classRef === null) return;
    setTab("classes");
    setTyped("");
    void navigate(threadPath(classRef), { state: { compose: true } });
  };

  // New message opens the thread it picked with the composer focused, the
  // existing one or an empty one that the first post makes (DG-233).
  const openPicked = (picked: Picked) => {
    setPicking(false);
    const kind = picked.audience === "colleagues" ? "colleague" : "direct";
    if (tab !== "all" && TAB_KIND[tab] !== kind) setTab("all");
    void navigate(threadPath({ kind, id: picked.id }), {
      state: { compose: true },
    });
  };

  const showList = !single || open === null;
  const showThread = !single || open !== null;

  return (
    <div className="flex h-[calc(100svh-110px)] min-h-130 flex-col gap-3 min-[768px]:h-[calc(100svh-120px)] min-[768px]:gap-4">
      <PageHead
        title={t("messages.title")}
        description={t("messages.lead")}
        actions={
          <div className="flex items-center gap-2">
            {offReason !== undefined && !single && (
              <span id={reasonId} className="text-muted-fg text-meta whitespace-nowrap">
                {offReason}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              className="max-[767px]:h-11"
              aria-haspopup="dialog"
              onClick={() => setPicking(true)}
            >
              <MessageSquarePlus />
              {t("messages.newMessage")}
            </Button>
            <Button
              type="button"
              className="max-[767px]:h-11"
              aria-disabled={announceOff || undefined}
              aria-describedby={
                offReason !== undefined && !single ? reasonId : undefined
              }
              title={offReason}
              onClick={newAnnouncement}
            >
              <Megaphone />
              {t("messages.newAnnouncement")}
            </Button>
          </div>
        }
      />
      <div className="bg-card shadow-card relative flex min-h-0 flex-1 overflow-hidden rounded-xl border">
        {showList && (
          <ThreadList
            label={t("messages.list.label")}
            single={single}
            tools={
              <>
                <SearchInput
                  value={typed}
                  onChange={setTyped}
                  placeholder={t("messages.list.search")}
                  className="[&_input]:bg-bg w-full [&_input]:h-8.5 [&_input]:text-sm max-[767px]:[&_input]:h-11 [&_svg]:top-1/2 [&_svg]:-translate-y-1/2"
                />
                <Segmented
                  label={t("messages.list.tabs")}
                  value={tab}
                  fill
                  className="[&_button]:gap-1 [&_button]:px-1.25 max-[767px]:[&_button]:h-10"
                  onChange={(value) => setTab(value as Tab)}
                  options={[
                    { value: "all", label: t("messages.list.tabAll") },
                    {
                      value: "direct",
                      label: t("messages.list.tabDirect"),
                      count: directUnread > 0 ? directUnread : undefined,
                    },
                    { value: "classes", label: t("messages.list.tabClasses") },
                    {
                      value: "colleagues",
                      label: t("messages.list.tabColleagues"),
                      count: colleagueUnread > 0 ? colleagueUnread : undefined,
                    },
                  ]}
                />
              </>
            }
            rows={rows}
            candidates={candidates}
            state={listState}
            onRetry={retryList}
            emptyText={
              tab === "colleagues"
                ? t("messages.list.colleagueEmpty")
                : t("messages.list.empty")
            }
            emptyIcon={tab === "colleagues" ? Users : MessageSquare}
            noMatchText={q === "" ? null : t("messages.list.noMatch", { q })}
          />
        )}
        {showThread && open !== null && (
          <StaffThreadPane
            key={`${open.kind}:${open.id}`}
            open={open}
            row={openRow}
            single={single}
            onBack={() => void navigate(MESSAGES_PATH)}
          />
        )}
        {showThread && open === null && (
          <div
            className="bg-sidebar flex min-w-0 flex-1 flex-col justify-end gap-3 p-4"
            aria-hidden="true"
          />
        )}
      </div>
      <RecipientPicker
        open={picking}
        onOpenChange={setPicking}
        audiences={PICKER_AUDIENCES}
        onPick={openPicked}
      />
    </div>
  );
}

/**
 * StaffThreadPane is the open thread of the staff side: a student's direct
 * thread with its attempt-event cards, a class's channel of announcements,
 * or a thread with a colleague (F2), which polls, pages, sends and attaches
 * as a student's does, with no attempt cards and no "Seen by".
 */
function StaffThreadPane({
  open,
  row,
  single,
  onBack,
}: Readonly<{
  open: ThreadRef;
  row: Listed | undefined;
  single: boolean;
  onBack: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const location = useLocation();
  const source = useMemo(() => sourceFor(open), [open]);
  const [refused, setRefused] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const threadKey = `${open.kind}:${open.id}`;
  const [draft, setDraft] = useDraft(threadKey);
  const canAnnounce = useCan("teaching.classes.write");

  const thread = useThread(source, {
    onSent: () => {
      for (const queryKey of LIST_KEYS) void client.invalidateQueries({ queryKey });
    },
    onRefused: (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        setRefused(cause.code);
        void thread.refetch();
      }
    },
    onRead: () => {
      if (open.kind === "colleague")
        client.setQueriesData<{ threads: ColleagueThread[] }>(
          { queryKey: [...STAFF_MESSAGES_KEY, "colleagues"] },
          (held) =>
            held && {
              threads: held.threads.map((x) =>
                x.colleagueId === open.id ? { ...x, unread: 0 } : x,
              ),
            },
        );
      else
        client.setQueriesData<{ threads: StaffThread[] }>(
          { queryKey: [...STAFF_MESSAGES_KEY, "threads"] },
          (held) =>
            held && {
              threads: held.threads.map((x) =>
                sameRef(refOf(x), open) ? { ...x, unread: 0 } : x,
              ),
            },
        );
      void client.invalidateQueries({ queryKey: dashboardKeys.summary });
      // The server marks the bell's message.received item read with the pointer.
      void client.invalidateQueries({ queryKey: notificationKeys.summary("teacher") });
    },
  });
  const data = thread.data;

  // New announcement opens a channel with its composer focused.
  const compose = (location.state as LocationState)?.compose === true;

  const isClass = open.kind === "class";
  const view = paneView(open, data?.head, row, t);

  const download = (attachment: MessageAttachment) => {
    setDownloading(attachment.id);
    getStaffAttachmentUrl(attachment.id).then(
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
    ? buildStream(data.messages, data.events, thread.pending, {
        now: new Date(),
        locale,
        t,
        complete: data.nextBefore === null,
      })
    : [];

  const avatar = <PaneAvatar view={view} />;
  const footer = (
    <StaffFooter
      view={view}
      blocked={blockedBy(view, refused, canAnnounce)}
      draft={draft}
      onDraft={setDraft}
      onSend={thread.send}
      focusRequest={compose ? location.key : undefined}
    />
  );

  return (
    <ThreadView
      threadKey={threadKey}
      avatar={avatar}
      title={view.title}
      sub={view.sub}
      onBack={single ? onBack : undefined}
      details={
        view.title === "" ? null : (
          <StaffDetails
            view={view}
            avatar={avatar}
            files={sharedFiles(data?.messages)}
          />
        )
      }
      state={stateOf(thread)}
      onRetry={() => void thread.refetch()}
      count={entries.length}
      oldestKey={entries.find((entry) => entry.kind !== "day")?.key ?? null}
      emptyIcon={isClass ? Megaphone : MessageSquare}
      emptyText={emptyThreadText(view, t)}
      canLoadEarlier={data?.nextBefore != null}
      earlier={thread.earlier}
      onLoadEarlier={thread.loadEarlier}
      latestId={data?.latestId ?? null}
      onSeen={thread.seen}
      footer={footer}
    >
      {entries.map((entry) => (
        <StaffEntry
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

/** emptyThreadText is the sentence of a thread with nothing in it yet. */
function emptyThreadText(view: PaneView, t: TFunction): string {
  if (view.ref.kind === "class") return t("messages.thread.channelEmpty");
  // A colleague thread names who can read it (D17).
  if (view.ref.kind === "colleague")
    return t("messages.thread.colleagueEmpty", { name: view.title });
  return t("messages.thread.empty");
}

/** sharedFiles is the files a thread holds, newest first, for a colleague's Details. */
function sharedFiles(
  messages: readonly StaffMessage[] | undefined,
): MessageAttachment[] {
  return (messages ?? [])
    .flatMap((message) => (message.attachment === null ? [] : [message.attachment]))
    .reverse();
}

/** PaneView is what the pane says of the thread, from its read or, while that loads, from its row. */
type PaneView = Readonly<{
  ref: ThreadRef;
  title: string;
  sub: string;
  avatarUrl: string | null;
  former: boolean;
  count: number;
  classes: readonly Readonly<{ id: string; name: string }>[];
  /** A student's current classes that the caller does not teach, by name. */
  otherClassNames: readonly string[];
  /** The caller teaches the student now: Details lists the classes and opens Students. */
  taught: boolean;
  canPost: boolean;
  archived: boolean;
}>;

function paneView(
  ref: ThreadRef,
  head: Head | undefined,
  listed: Listed | undefined,
  t: TFunction,
): PaneView {
  if (ref.kind === "colleague") {
    const peer = head?.kind === "colleague" ? head.colleague : null;
    const held = listed?.source === "colleague" ? listed.row : undefined;
    const who = peer ?? held;
    return {
      ref,
      title: peer?.name ?? held?.title ?? "",
      sub: who === undefined ? "" : colleagueRole(who, t),
      avatarUrl: peer?.avatarUrl ?? held?.avatarUrl ?? null,
      former: false,
      count: 0,
      classes: [],
      otherClassNames: [],
      taught: false,
      canPost: peer === null ? held?.disabled !== true : peer.canPost,
      archived: false,
    };
  }
  const row = listed?.source === "staff" ? listed.row : undefined;
  if (ref.kind === "class") {
    const room = head?.kind === "class" ? head.room : null;
    const count = room?.studentCount ?? row?.studentCount ?? 0;
    return {
      ref,
      title: room?.name ?? row?.title ?? "",
      sub: t("messages.thread.classSub", { count }),
      avatarUrl: null,
      former: false,
      count,
      classes: [],
      otherClassNames: [],
      taught: false,
      canPost: true,
      archived: room?.archived === true,
    };
  }
  const student = head?.kind === "direct" ? head.student : null;
  const former = student?.former ?? row?.former ?? false;
  const classNames = student?.classes.map((c) => c.name) ?? row?.classNames ?? [];
  const otherClassNames = student?.otherClassNames ?? row?.otherClassNames ?? [];
  return {
    ref,
    title: student?.name ?? row?.title ?? "",
    sub: studentLine(former, classNames, otherClassNames, t),
    avatarUrl: student?.avatarUrl ?? row?.avatarUrl ?? null,
    former,
    count: 0,
    classes: student?.classes ?? [],
    otherClassNames,
    taught: classNames.length > 0,
    canPost: student?.canPost !== false,
    archived: false,
  };
}

/** Blocked is why nothing can be sent from the open thread, or null when something can. */
type Blocked = "account" | "archived" | "notAllowed" | null;

/**
 * blockedBy says why the composer gives its place to a sentence: the
 * student's account is disabled (409 MESSAGING_NOT_ALLOWED), the class is
 * archived (409 CLASS_ARCHIVED), or the caller may read the class but not
 * announce to it (`postClassAnnouncement` needs `teaching.classes.write`).
 * Leaving a class closes nothing (T-R7.10a).
 */
function blockedBy(
  view: PaneView,
  refused: string | null,
  canAnnounce: boolean,
): Blocked {
  if (view.ref.kind === "class") {
    if (view.archived || refused === "CLASS_ARCHIVED") return "archived";
    return canAnnounce ? null : "notAllowed";
  }
  return !view.canPost || refused === "MESSAGING_NOT_ALLOWED" ? "account" : null;
}

/** StaffFooter is the composer, or the sentence that stands in its place when nothing can be sent. */
function StaffFooter({
  view,
  blocked,
  draft,
  onDraft,
  onSend,
  focusRequest,
}: Readonly<{
  view: PaneView;
  blocked: Blocked;
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onSend: (outgoing: Outgoing) => void;
  focusRequest: string | undefined;
}>) {
  const { t } = useTranslation();
  if (blocked === "archived")
    return <ThreadNotice icon={Archive} text={t("messages.archived")} />;
  if (blocked === "account")
    return (
      <ThreadNotice icon={Ban} text={t("messages.accountOff", { name: view.title })} />
    );
  if (blocked === "notAllowed")
    return <ThreadNotice icon={Lock} text={t("messages.announceNotAllowed")} />;
  const isClass = view.ref.kind === "class";
  return (
    <Composer
      draft={draft}
      onDraft={onDraft}
      onSend={onSend}
      focusRequest={focusRequest}
      enterSends={!isClass}
      attach={STAFF_ATTACH}
      placeholder={
        isClass
          ? t("messages.placeholderClass", { name: view.title })
          : t("messages.placeholderDirect", { name: givenName(view.title) })
      }
      hint={isClass ? t("messages.classHint", { count: view.count }) : undefined}
    />
  );
}

function PaneAvatar({ view }: Readonly<{ view: PaneView }>) {
  if (view.ref.kind === "class")
    return <IconTile icon={Megaphone} size={34} tone="accent" />;
  return <Avatar name={view.title} src={view.avatarUrl} size="36" />;
}

/** StaffDetails is the header's Details for a student, a class (DG-91) or a colleague (DG-233). */
function StaffDetails({
  view,
  avatar,
  files,
}: Readonly<{
  view: PaneView;
  avatar: ReactNode;
  files: readonly MessageAttachment[];
}>) {
  const { t } = useTranslation();
  // A colleague: the role, then the files in the thread as text, and no link,
  // since a teacher has no page of colleagues.
  if (view.ref.kind === "colleague")
    return (
      <ThreadDetails
        avatar={avatar}
        title={view.title}
        role={view.sub}
        label={t("messages.about.files")}
        rows={files.map((file) => ({
          key: file.id,
          icon: KIND_ICON[KIND_OF[file.mimeType]],
          text: file.filename,
        }))}
      />
    );
  if (view.ref.kind === "class")
    return (
      <ThreadDetails
        avatar={avatar}
        title={view.title}
        role={t("messages.about.class")}
        label={t("messages.about.members")}
        rows={[
          {
            key: "count",
            icon: Users,
            text: t("messages.about.count", { count: view.count }),
          },
        ]}
        link={{
          to: `/teacher/classes/${encodeURIComponent(view.ref.id)}`,
          label: t("messages.about.openClass"),
        }}
      />
    );
  if (view.former)
    return (
      <ThreadDetails
        avatar={avatar}
        title={view.title}
        role={t("messages.former")}
        note={t("messages.about.former")}
      />
    );
  // A student the caller does not teach (F2): their classes, by name, and one
  // sentence; no link, since Students and the class pages are the caller's own.
  if (!view.taught)
    return (
      <ThreadDetails
        avatar={avatar}
        title={view.title}
        role={t("messages.about.student")}
        label={t("messages.about.theirClasses")}
        rows={view.otherClassNames.map((name, index) => ({
          key: `${index}:${name}`,
          icon: GraduationCap,
          text: name,
        }))}
        note={
          view.otherClassNames.length > 0
            ? t("messages.about.notTaught")
            : t("messages.about.noClass")
        }
      />
    );
  return (
    <ThreadDetails
      avatar={avatar}
      title={view.title}
      role={t("messages.about.student")}
      label={t("messages.about.classes")}
      rows={view.classes.map((c) => ({ key: c.id, icon: GraduationCap, text: c.name }))}
      link={{
        to: `/teacher/students?${new URLSearchParams({ q: view.title }).toString()}`,
        label: t("messages.about.openStudent"),
      }}
    />
  );
}

/** StaffEntry draws one line of the staff stream: a day, an attempt event, a message or one on its way. */
function StaffEntry({
  entry,
  isClass,
  download,
  downloading,
  retry,
}: Readonly<{
  entry: StreamEntry<StaffMessage>;
  isClass: boolean;
  download: (attachment: MessageAttachment) => void;
  downloading: string | null;
  retry: (clientId: string) => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  if (entry.kind === "day") return <DayPill label={entry.label} />;
  if (entry.kind === "event")
    return (
      <AttemptEventCard event={entry.event} time={clock(entry.event.at, locale)} />
    );
  if (entry.kind === "pending") {
    const p = entry.pending;
    const again = () => retry(p.clientId);
    if (isClass)
      return (
        <AnnouncementCard
          body={p.body}
          attachment={p.attachment}
          time=""
          status={p.status}
          onRetry={again}
        />
      );
    return (
      <MessageBubble
        mine
        body={p.body}
        attachment={p.attachment}
        time=""
        status={p.status}
        onRetry={again}
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
        seen={
          m.seenBy === undefined
            ? undefined
            : t("messages.seenBy", { seen: m.seenBy.seen, of: m.seenBy.of })
        }
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
